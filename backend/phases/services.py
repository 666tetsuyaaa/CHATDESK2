"""
Extracts candidate SchoolPhase entries from an uploaded academic calendar
PDF. Renders each page to an image and sends them to OpenAI as vision
input - tried plain text extraction first (pypdf) during development and
it came out too garbled to trust (this calendar is a dense, color-coded
table layout, not prose), so this reads it the same way a human would:
by looking at it.

Only ever returns candidates for review - nothing here writes to the
database. That happens through the existing, already-validated
POST /api/v1/phases/ endpoint once an admin confirms each one.
"""

import base64
import json

import pymupdf
from django.conf import settings
from openai import OpenAI

from faqs.models import Faq

MODEL = "gpt-5.6-luna"
RENDER_DPI = 150
MAX_PAGES = 20
MAX_FAQS_IN_PROMPT = 200

SYSTEM_PROMPT = """You are reading an official USTP academic calendar (a color-coded table \
document, not prose) to extract periods relevant to a STUDENT-facing chatbot's guidance \
banner. The calendar spans one academic year across two calendar years - use the "Summary \
of Periods" table (1st semester, 2nd semester, Mid-Year Term start/end dates, which DO \
include explicit years) as your anchor for resolving which calendar year every other \
"Month Day" entry belongs to, since most remarks-table rows only give a month and day.

Only extract periods a STUDENT would care about and might ask the chatbot about:
- Enrollment periods (early enrollment, regular enrollment, adding/dropping subjects)
- Examination periods (preliminary, midterm, pre-final, final)
- Application for graduation
- Orientation / Week of Welcome
- Submission of enrollment list (student-facing deadline)
- Any other period a student would plan around

Do NOT extract:
- Plain public holidays with no academic significance (Independence Day, Christmas, etc.)
- Faculty-only or administrative-only items (grade submission deadlines for faculty, \
faculty evaluation, faculty leave, promotional list submission, BOR resolutions)
- Single commemorative dates with no action for students (birthdays, death anniversaries)
- Anything that isn't a real dated period on the calendar - never invent one

For each extracted period, write a short, natural guidance_message (1-2 sentences) a \
chatbot could show a student during that window. Use the calendar's own official label as the \
name, cleaned up (no trailing "(Undergraduate Levels)" type qualifiers unless needed to \
disambiguate UG from Graduate versions of the same period - if both exist with different \
dates, keep them as separate entries with distinguishing names).

All dates must be YYYY-MM-DD. If a date range spans two months without a year change \
(e.g. "Jul. 28 - Aug. 1"), infer both dates use the same year from context."""

RESPONSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "extracted_phases",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "phases": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "start_date": {"type": "string"},
                            "end_date": {"type": "string"},
                            "guidance_message": {"type": "string"},
                        },
                        "required": ["name", "start_date", "end_date", "guidance_message"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["phases"],
            "additionalProperties": False,
        },
    },
}


def _render_pages_as_data_urls(pdf_bytes):
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    if doc.page_count > MAX_PAGES:
        raise ValueError(f"PDF has {doc.page_count} pages - only up to {MAX_PAGES} are supported.")

    data_urls = []
    for page in doc:
        pixmap = page.get_pixmap(dpi=RENDER_DPI)
        png_bytes = pixmap.tobytes("png")
        encoded = base64.b64encode(png_bytes).decode("ascii")
        data_urls.append(f"data:image/png;base64,{encoded}")
    doc.close()
    return data_urls


def _faq_reuse_instructions():
    """Phase chips are sent to the chatbot verbatim. Reusing an FAQ's exact
    question makes the chip hit the chatbot's exact-match path - always
    answered, no AI call - instead of risking a clarification or ticket."""
    questions = list(Faq.objects.order_by("faq_id").values_list("question_text", flat=True)[:MAX_FAQS_IN_PROMPT])
    if not questions:
        return ""
    listed = "\n".join(f"- {q}" for q in questions)
    return (
        "\n\nThe chatbot's knowledge base already answers these exact questions. When a "
        "suggested_question you'd write means the same as one of them, use that question's "
        "exact wording instead of your own. Only write a new question if none fit:\n" + listed
    )


def extract_phases_from_pdf(pdf_bytes):
    """Returns a list of candidate phase dicts (not yet saved)."""
    page_images = _render_pages_as_data_urls(pdf_bytes)

    content = [{"type": "text", "text": "Extract the student-facing academic phases from this calendar."}]
    for data_url in page_images:
        content.append({"type": "image_url", "image_url": {"url": data_url}})

    # Vision over up to 20 pages is slow, but never minutes-long.
    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=90, max_retries=1)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT + _faq_reuse_instructions()},
            {"role": "user", "content": content},
        ],
        response_format=RESPONSE_SCHEMA,
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed["phases"]
