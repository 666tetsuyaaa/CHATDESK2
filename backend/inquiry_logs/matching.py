"""
Smart FAQ matching by meaning, before the AI classifier.

Every FAQ question is turned into an OpenAI embedding (a list of numbers
that captures its meaning) once, and stored on the FAQ. Each new student
message is embedded too, and compared with every FAQ. When one FAQ is a
clear match - close enough (FAQ_MATCH_THRESHOLD) and clearly ahead of the
next best one (FAQ_MATCH_MARGIN) - its answer is sent straight away: one
cheap embedding call instead of the slower classifier. Anything less clear,
and any error, goes to the classifier as before.

The embedding only picks the FAQ; replies are still the FAQ's own answer.

Stored embeddings are about 30 KB each, so they are kept in memory once
read (_vector_cache) and only new or edited FAQs are read from the database
or sent to OpenAI. Callers pass FAQs loaded without the embedding columns.
"""

import logging
import math
import re

from django.conf import settings

logger = logging.getLogger(__name__)

# Embedding calls are quick; don't let a slow one hold up the classifier.
EMBEDDING_TIMEOUT_SECONDS = 5

# Mid-conversation messages like "what about that?" only make sense with the
# earlier turns, which an embedding of the message alone can't see - leave
# those to the classifier, which reads the conversation.
REFERS_BACK = re.compile(
    r"\b(that|this|those|these|it|its|them|same|also|again|else|"
    r"yan|iyan|yun|iyon|yon|ito|dun|doon|din|rin|ulit)\b",
    re.IGNORECASE,
)

# faq_id -> (question text the vector was made from, unit vector)
_vector_cache = {}


def clear_cache():
    _vector_cache.clear()


def _unit(vector):
    length = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / length for x in vector]


def embed(client, texts):
    """Unit-length embeddings for `texts`, so a dot product is the cosine
    similarity."""
    response = client.with_options(timeout=EMBEDDING_TIMEOUT_SECONDS).embeddings.create(
        model=settings.FAQ_EMBEDDING_MODEL, input=texts
    )
    return [_unit(item.embedding) for item in sorted(response.data, key=lambda item: item.index)]


def faq_vectors(client, faqs):
    """{faq_id: vector} for `faqs`. Uses the in-memory cache, then the stored
    embeddings, and only calls OpenAI for FAQs with none yet or whose
    question changed since. Returns (vectors, how many were newly embedded)."""
    from faqs.models import Faq

    vectors, missing = {}, []
    for faq in faqs:
        cached = _vector_cache.get(faq.pk)
        if cached and cached[0] == faq.question_text:
            vectors[faq.pk] = cached[1]
        else:
            missing.append(faq)
    if not missing:
        return vectors, 0

    stored = {
        pk: (text, vector)
        for pk, text, vector in Faq.objects.filter(pk__in=[f.pk for f in missing]).values_list(
            "pk", "embedding_text", "embedding"
        )
    }
    stale = []
    for faq in missing:
        text, vector = stored.get(faq.pk, ("", None))
        if vector and text == faq.question_text:
            _vector_cache[faq.pk] = (text, vector)
            vectors[faq.pk] = vector
        else:
            stale.append(faq)

    if stale:
        for faq, vector in zip(stale, embed(client, [faq.question_text for faq in stale])):
            # update() rather than save(): doesn't touch updated_at/updated_by.
            Faq.objects.filter(pk=faq.pk).update(embedding=vector, embedding_text=faq.question_text)
            _vector_cache[faq.pk] = (faq.question_text, vector)
            vectors[faq.pk] = vector
    return vectors, len(stale)


def ensure_faq_embeddings(client, faqs):
    """Embeds FAQs that have none yet or whose question changed. Returns
    how many were updated (used by the embed_faqs command)."""
    return faq_vectors(client, faqs)[1]


def similarity(a, b):
    return sum(x * y for x, y in zip(a, b))


def rank_faqs(client, message, faqs):
    """[(score, faq), ...] best first."""
    vectors, _ = faq_vectors(client, faqs)
    [query] = embed(client, [message])
    return sorted(((similarity(query, vectors[faq.pk]), faq) for faq in faqs), key=lambda pair: -pair[0])


def clear_match(client, message, faqs, history=None):
    """The FAQ that clearly answers `message`, or None to let the classifier
    decide. Never raises: any OpenAI problem just means "not sure"."""
    if not settings.FAQ_SEMANTIC_MATCHING or not faqs:
        return None
    if history and REFERS_BACK.search(message):
        return None
    try:
        ranked = rank_faqs(client, message, faqs)
    except Exception:
        logger.warning("FAQ embedding match failed; using the classifier.", exc_info=True)
        return None
    best_score, best = ranked[0]
    runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
    if best_score >= settings.FAQ_MATCH_THRESHOLD and best_score - runner_up >= settings.FAQ_MATCH_MARGIN:
        return best
    return None
