# ChatDesk API Contract — v0.1 (Sprint 1 Baseline)

Covers: Authentication, the unified dynamic User model, FAQ Knowledge Base management, Inquiry Logging (AI chat history), and the Core Ticketing Escalation workflow. Advanced OpenAI intent context injection, analytics aggregation, and SUS evaluation reporting are NOT in this version — they will be handled in Sprint 2.

This is the agreed shape that the Django backend developer will build against, and the React Native (mobile) and ReactJS (web) developers will consume. Changing a field name or endpoint path after the sprint starts requires updating this file and notifying the other devs — don't silently drift.

--

## Conventions
- Base URL: /api/v1/
- All request/response bodies: JSON
- Auth header: Authorization: Bearer <access_token>
- Timestamps: ISO 8601 UTC (2026-06-17T10:00:00Z)
- List endpoints are paginated:

{
  "count": 128,
  "next": "/api/v1/tickets/?page=2",
  "previous": null,
  "results": [ ... ]
}

- Error shape (consistent across all endpoints):

{
  "error": "validation_error",
  "message": "Invalid request parameters.",
  "details": { "email": ["This field must be a valid email address."] }
}

- Non-field errors (e.g. wrong login password) come in details.non_field_errors -
  show that to the user, not the generic "Invalid request parameters." message.
- List filters are checked: an id filter that isn't a positive whole number
  (?office=abc, ?user_id=abc) or a date that isn't a real YYYY-MM-DD date
  (?date_from=2026-13-45) returns 400 under the parameter's name, e.g.
  { "office": ["Must be a number."] } or
  { "date_from": ["Use a valid date in YYYY-MM-DD format."] }.
- Lists a screen shows in full (phases, announcements, offices in dropdowns
  and the app's office picker) are still paginated - clients request page 1,
  2, ... until "next" is null, rather than using only the first 20.
- Rate limits: some endpoints are throttled (noted per endpoint). Over the limit
  returns 429 with error "throttled" and a message saying when to retry:
  { "error": "throttled", "message": "Request was throttled. Expected available in 42 seconds.", "details": {} }

## Authentication

### POST /api/v1/auth/register/
Public. Creates a student account. admin accounts are created manually via the Django superuser terminal by the system administrator. Note: Students can register using ANY valid email address (Gmail, Yahoo, etc.); it is not restricted to the USTP domain.

Request:
{
  "email": "student@gmail.com",
  "password": "securepassword123",
  "first_name": "Jefferson",
  "last_name": "Booc",
  "school_id": "2021-00123",
  "course": "BSIT"
}
Response 201:
{
  "user": { 
    "user_id": 1, 
    "email": "student@gmail.com", 
    "first_name": "Jefferson",
    "last_name": "Booc",
    "role": "student", 
    "course": "BSIT",
    "school_id": "2021-00123"
  },
  "access": "jwt_access_token_string",
  "refresh": "jwt_refresh_token_string"
}
# school_id must be unique - register returns 400 with a school_id validation
# error if it's already taken (same pattern as the email uniqueness check).
# password must pass the full password rules (not too common, not all numbers,
# not too similar to the name/email, 8+ characters) - 400 under details.password.
# No email verification: the account is ready at once (is_email_verified is
# always true) and the student is logged in by this response. A "Welcome to
# ChatDesk" email (no link) is sent best effort - if Gmail fails, the account
# is still created and the response is still 201.
# Optional backend setting (off by default): ALLOWED_EMAIL_DOMAINS limits
# registration to e.g. ustp.edu.ph (400 under details.email).
# Throttled: 100/hour per IP (loose, since a whole campus Wi-Fi can share one IP).

### POST /api/v1/auth/login/
Public.
Request: { "email": "string", "password": "string" }
Response 200: Same shape as the register response.
Response 400: reason in details.non_field_errors - "Invalid email or password.",
or "This account has been deactivated.".
Throttled: 100/min per IP and 10/min per email.

### POST /api/v1/auth/token/refresh/
Public (requires valid refresh token).
Request: { "refresh": "jwt_refresh_token_string" } → Response 200: { "access": "new_jwt_access_string", "refresh": "new_jwt_refresh_string" }
# Refresh tokens rotate: the old one is blacklisted the moment it's used.
# Clients MUST store the new "refresh" from every response - reusing the old
# one returns 401 (this is what logged users out ~30 minutes after login).
# A deactivated account's refresh token is refused with 401
# ("This account has been deactivated."), so the apps log the user out.
# Clients log out only on a 401/400 from this endpoint - a network error,
# timeout or 5xx just fails that request and the next one tries again.

### POST /api/v1/auth/logout/
Auth required. Blacklists the refresh token.
Request: { "refresh": "jwt_refresh_token_string" } → Response 205.

### GET /api/v1/auth/me/
Auth required. Returns the current authenticated user's profile.

### PATCH /api/v1/auth/me/
Auth required. Lets a student or admin edit their own first_name/last_name/
profile_picture (role, email, is_active, and school_id stay untouchable via
this endpoint). Send multipart/form-data (not JSON) when including
profile_picture. Response is just the fields you can edit, not the full
User Profile shape - re-fetch GET /auth/me/ if you need the rest.

Request (multipart/form-data):
first_name=Jefferson&last_name=Booc&profile_picture=<file>
Response 200: { "first_name": "Jefferson", "last_name": "Booc", "profile_picture": "http://<host>/media/profile_pictures/xyz.jpg" }
# profile_picture: max 2 MB (400 under details.profile_picture otherwise).
# Stored as a JPEG shrunk to fit 512x512.

### POST /api/v1/auth/password-reset/request/
Public. Mobile "Forgot Password" step 1. Emails a 6-digit code (10 min expiry)
to the account if one exists and is active. Always responds the same way
regardless of whether the email is registered - never confirms/denies
account existence.

Request: { "email": "student@gmail.com" }
Response 200: { "message": "If that email is registered, a password reset code has been sent." }
# Only the newest code is valid - requesting a new one cancels older ones.
# A new code can be requested once per 60 seconds per account.
# If Gmail fails to send, the response is still this same 200 (so it can't be
# used to discover which emails have accounts); the failure is logged.
# Dev fallback: only when DEBUG=True and backend/.env has no Gmail App
# Password, the response also includes "dev_code": "123456". It is never
# returned with DEBUG=False.
# Throttled: 60/hour per IP and 5/hour per email.

### POST /api/v1/auth/password-reset/confirm/
Public. Mobile "Forgot Password" step 2. Verifies the emailed code and sets
a new password. Code is single-use; a successful reset invalidates any
other outstanding codes for that user.

Request:
{
  "email": "student@gmail.com",
  "code": "123456",
  "new_password": "newsecurepassword123"
}
Response 200: { "message": "Password has been reset. You can now log in." }
Response 400 (wrong/expired/already-used code, or unknown email):
{ "error": "validation_error", "message": "Invalid request parameters.", "details": { "code": ["Invalid or expired code."] } }
# A code stops working after 5 wrong guesses (request a new one).
# A successful reset signs the user out of every existing session (all their
# refresh tokens are blacklisted).
# Throttled: 100/hour per IP.
# Not on the original ERD - tbl_password_reset_code added post-Sprint-1-baseline
# to support this flow; flagged for the team to fold into the next ERD revision.

## User Profile (Referenced by other endpoints)
{
  "user_id": 1,
  "email": "student@gmail.com",
  "first_name": "Jefferson",
  "last_name": "Booc",
  "role": "student",
  "course": "BSIT",
  "school_id": "2021-00123",
  "profile_picture": "http://<host>/media/profile_pictures/xyz.jpg",
  "is_active": true,
  "last_login": "2026-07-20T09:12:00Z",
  "created_at": "2026-06-15T08:00:00Z"
}
# Note: course and school_id are nullable for admin accounts. school_id is
# unique per user (added post-Sprint-1-baseline; not on the original ERD -
# flagged for the team to fold into the next ERD revision). is_active and
# last_login are Django's built-in AbstractUser fields, now surfaced for the
# admin User Management screen below - last_login is null until the user's
# first login after this field started being stamped. profile_picture is
# null until the user uploads one via PATCH /auth/me/ (see above) - also not
# on the original ERD, flagged for the same future revision.

## User Management (Admin Dashboard)
Admin only. Manages the same tbl_user accounts students log into on mobile -
deactivating a user here immediately blocks their next login attempt.

Method,Path,Notes
GET,/api/v1/users/,"List users, sorted by name A-Z. ?search= (name/email), ?role=student|office_admin|superadmin, ?status=active|inactive, ?sort=desc (Z-A)."
POST,/api/v1/users/,"Create a student or admin account directly (admin picks the role; distinct from public self-registration)."
GET,/api/v1/users/{user_id}/,Detail view.
PATCH,/api/v1/users/{user_id}/,"Edit first_name/last_name/role/course/school_id/is_active/office. An admin cannot deactivate or demote their own account (403). office is kept only for office_admin (required there) and cleared for every other role. Changing role also sets Django /admin access to match: only superadmin has it."
DELETE,/api/v1/users/{user_id}/,"Remove an account (204). An admin cannot delete their own account (403). The account's chat logs, tickets (with their messages) and announcements are kept: their link to the account becomes null - inquiry logs show user_name ""Deleted student"" and user_email null, tickets show user_id/user_email null, a student's ticket messages show sender_name ""Deleted student"". Each inquiry log and ticket keeps the student's course (student_course, kept in step if an admin changes the course), so ?college= filters and analytics are unchanged. No ticket emails are sent for a deleted student. Deactivating (PATCH is_active=false) is still available to block a login without deleting."
GET,/api/v1/colleges/,"Any authenticated user. Colleges and their course codes, for college filters (not paginated): [{ ""key"": ""it_computing"", ""name"": ""Information Technology & Computing"", ""courses"": [{ ""code"": ""BSIT"", ""name"": ""BS Information Technology"" }] }]. Programs with majors have one code per major (e.g. BSELT-TN). Older codes from before the November 2026 list (BTLED, BTVTED, BSED, BEED, BSELT, BSESM, BSEMT) are listed with ""retired"": true - accounts that already have one keep it, but register/create/PATCH reject moving an account onto one (400)."
# Input rules (register, PATCH /auth/me/, admin create/edit - 400 under the field):
# - first_name / last_name: must contain letters, max 150.
# - school_id: 6-20 digits, hyphens allowed, starts and ends with a digit
#   (e.g. 2023304440 or 2026-00006); unique.
# - password (register + admin create): full password rules, as in register.

## FAQ (Knowledge Base)
{
  "faq_id": 105,
  "user_id": 2, 
  "intent_keyword": "scholarship_requirements",
  "question_text": "What are the requirements for the academic scholarship?",
  "answer_content": "To apply for the academic scholarship, you must submit your Certificate of Registration, a 2x2 ID picture, and your previous semester's grades to the OSA office.",
  "category": "Scholarship",
  "created_at": "2026-06-10T09:00:00Z",
  "updated_at": "2026-06-15T14:30:00Z",
  "updated_by": 2
}
category enum: Enrollment, Scholarship, Clearance, Discipline, General.

Method,Path,Roles,Notes
GET,/api/v1/faqs/,all,"List FAQs. ?category=, ?search= (question or intent_keyword), and ?office=<id> or ?office=unassigned (FAQs with no office). Office Admins always get only their own office's FAQs."
POST,/api/v1/faqs/,admin,Create a new FAQ entry.
GET,/api/v1/faqs/popular/,all,"The FAQs students ask most (chat quick actions). ?office= narrows to that office's FAQs + uncategorized ones; ?limit= (default 3, max 10). Not paginated: [{ ""faq_id"": 105, ""question_text"": ""..."" }]"
GET,/api/v1/faqs/{faq_id}/,all,Detail view.
PATCH,/api/v1/faqs/{faq_id}/,admin,Edit FAQ (automatically updates updated_at and updated_by).
DELETE,/api/v1/faqs/{faq_id}/,admin,Remove obsolete FAQ.
# Validation on create/edit: answer_content must be at least 15 characters
# (students see it word for word - no placeholders like "OSA ONLY"), and
# question_text/answer_content must not contain the broken character "�"
# (usually from copy-pasting). intent_keyword: 2-100 letters, numbers or
# underscores, no spaces; unique ignoring capitals ("Enrollment" is refused
# when "enrollment" exists); and not one of the chatbot's own outcome names
# (unresolved_complex_query, duplicate_ticket, conversational,
# needs_clarification, off_topic, unclear). question_text: max 300. All
# return 400 under the field name.

## Chat Interaction & Inquiry Logging
This handles the core AI interaction. The frontend posts a message, the backend hits the OpenAI API, logs the interaction in tbl_inquiry_logs, and returns the response.

## POST /api/v1/chat/ask/
Auth required (Student). Throttled: 20/min per student.

Request:
{
  "message": "Pano mag apply ng scholarship?",
  "office": 3,
  "history": [
    { "role": "user", "text": "whats the process of enrollment" },
    { "role": "assistant", "text": "Enrollment Process for Freshmen..." }
  ]
}
# message: required, max 1000 characters (400 under details.message).
# office: optional - the office picked in the category selector.
# history: optional - the current chat's earlier turns, oldest first (max 20;
# the app sends the last 6) so follow-ups are understood in context.

Response 200 (Successful AI Resolution):
{
  "log_id": 5042,
  "detected_intent": "scholarship_requirements",
  "reply": "To apply for the academic scholarship, you must submit your Certificate of Registration...",
  "is_escalated": false,
  "is_answer": true,
  "suggested_questions": [],
  "ticket_id": 889,
  "ticket_code": "OSA103126004",
  "ticket_title": "What are the requirements for the academic scholarship?",
  "ticket_ai_resolved": true
}
# Every real question gets a ticket. An FAQ answer is recorded as a ticket
# already resolved by the AI (ticket_ai_resolved: true) - it is NOT in the
# staff queue; the student can ask for staff follow-up on it (see
# POST /tickets/{ticket_id}/follow-up/). Greetings, gibberish, off-topic and
# clarification prompts create no ticket.
Response 201 (AI Failed, Ticket Escalation Triggered):
{
  "log_id": 5043,
  "detected_intent": "unresolved_complex_query",
  "reply": "I'm sorry, I couldn't find the exact procedure for that. I have automatically created a support ticket for you. An OSA staff member will review your concern shortly.",
  "is_escalated": true,
  "is_answer": false,
  "suggested_questions": [],
  "ticket_id": 890,
  "ticket_code": "GEN103126001",
  "ticket_title": "Late Enrollment Fee Waiver",
  "ticket_ai_resolved": false
}
# detected_intent is an FAQ's intent_keyword when answered, otherwise one of:
#   conversational        - greeting/thanks/"is that all?" - short fixed reply, no ticket
#   needs_clarification   - vague school question; suggested_questions holds up to 3 FAQ
#                           questions to offer as buttons (sending one verbatim is answered directly)
#   off_topic             - not about school - short scope reply, no ticket
#   unclear               - gibberish - asks to rephrase, no ticket
#   unresolved_complex_query - new ticket created (201)
#   duplicate_ticket      - same concern as one of the student's open tickets (200);
#                           no new ticket, ticket_id/ticket_code/ticket_title point to the existing one
# is_answer: true only for FAQ answers - the only replies that can be rated.
# How a message is decided: plain small talk ("hi", "thanks po") and an FAQ's
# exact question are answered with no AI call. Next, smart FAQ matching
# compares the message by meaning with every FAQ question (OpenAI embeddings,
# stored on each FAQ and recomputed when its question changes); a clear match
# is answered straight away. Everything else goes to the AI classifier.
# Backend settings: FAQ_SEMANTIC_MATCHING (default on), FAQ_MATCH_THRESHOLD
# (0.70), FAQ_MATCH_MARGIN (0.10 ahead of the next FAQ). Try messages with
# `python manage.py embed_faqs --try "..."`.

### PATCH /api/v1/chat/logs/{log_id}/feedback/
Auth required (Student, own logs only - others 404).
Request: { "feedback": "up" } or { "feedback": "down" }
Response 200: { "feedback": "up" }
Response 400 if the log isn't an FAQ answer (is_answer false).
# GET /api/v1/inquiry-logs/
Admin only. Returns raw logs for system analytics.
{
  "log_id": 5042,
  "user_id": 1,
  "user_message": "Pano mag apply ng scholarship?",
  "detected_intent": "scholarship_requirements",
  "chatbot_response": "To apply for the academic scholarship...",
  "is_escalated": false,
  "office": 3,
  "office_name": "Office of Student Affairs (OSA)",
  "student_college": "Information Technology & Computing",
  "ticket_code": "OSA103126004",
  "feedback": null,
  "timestamp": "2026-06-15T10:15:00Z"
}
# Filters: ?intent=, ?user_id=, ?is_escalated=, ?date_from=, ?date_to=,
# ?college=<key from /colleges/>, and (Super Admin) ?office=<id> or
# ?office=unassigned. ticket_code is null for logs without a ticket.

### GET /api/v1/inquiry-logs/unanswered/
Admin only (students 403). Questions the chatbot couldn't answer from an FAQ
(sent to staff, or too unclear to match), grouped by similar wording, most
asked first. For the admin "Unanswered Questions" page.
Optional ?days= (default 90, 1-365) and (Super Admin) ?office=<id> or
?office=unassigned. Office Admins see only their own office's questions.
{
  "days": 90,
  "total_questions": 7,
  "groups": [
    {
      "question": "How do I get a good moral certificate?",
      "count": 3,
      "examples": ["How do I get a good moral certificate?", "how to get good moral cert"],
      "last_asked_at": "2026-11-07T08:20:00Z",
      "office_id": 5,
      "office_name": "Office of Student Affairs (OSA)",
      "ticket_codes": ["OSA110726001", "OSA110526003"]
    }
  ]
}
# question: the wording asked most often in the group. "talk to staff"-style
# requests are left out. A group is hidden once an FAQ with a matching
# question is added or edited after it was last asked (it shows again if
# students keep asking after that). office_id/office_name: the office most of
# the group's questions went to, or null.
## Ticket Escalation
{
  "ticket_id": 890,
  "ticket_code": "GEN103126001",
  "user_id": 1,
  "user_email": "student@gmail.com",
  "student_course": "BSIT",
  "student_college": "Information Technology & Computing",
  "resolved_by": null,
  "log_id": 5043,
  "title": "Late Enrollment Fee Waiver",
  "subject_category": "Unresolved Inquiry",
  "issue_description": "Student asked: 'Paano ko ma-waive ang late enrollment fee ko dahil sa medical emergency?' - AI could not resolve.",
  "conversation_context": "Student: hi\nChatDesk: Hi! I can help with...\nStudent: Paano ko ma-waive...",
  "status": "pending",
  "resolution": null,
  "is_ai_resolved": false,
  "created_at": "2026-06-15T10:16:00Z",
  "reopened_at": null,
  "resolved_at": null,
  "waiting_since": "2026-06-15T10:16:00Z",
  "is_overdue": false,
  "message_count": 2,
  "last_staff_message_at": "2026-06-15T11:02:00Z",
  "chatbot_answer": null
}
# ticket_code: office code + Manila date (MMDDYY) + that office's 3-digit
# number for the day, e.g. OSA103126001 = OSA's first ticket on Oct 31, 2026.
# "GEN" when the ticket has no office yet. Set once on creation and never
# changes, even if the ticket is rerouted. Unique.
# is_ai_resolved: true for the record of a question the chatbot answered from
# an FAQ (created already resolved, issue_description ends "- Answered by
# ChatDesk.", resolution = the FAQ answer). It becomes false once a student
# asks for follow-up or staff reply to it.
# reopened_at: when an AI-answered ticket moved to staff (the student asked
# for follow-up, or staff messaged them); staff resolution time is measured
# from here (otherwise created_at).
# resolution: the admin's written answer, set via PATCH alongside status. Null
# until an admin responds. Not on the original ERD - added post-Sprint-1-
# baseline to fulfill the "add resolution notes" PATCH behavior already
# described below; flagged for the team to fold into the next ERD revision.
# title: short AI-generated label shown with the number ("Late Enrollment Fee
# Waiver - Ticket #890"); "General Inquiry" if none could be generated. Admins
# can edit it via PATCH. conversation_context: the chat turns right before an
# AI escalation, read-only, empty for manual tickets. Neither is on the
# original ERD - flagged for the next ERD revision.
# waiting_since: when the ticket last started waiting on staff - on creation,
# on a follow-up request, and when a student message moves it back to
# pending. Null for chatbot-answered tickets. is_overdue: a staff ticket still
# "pending" more than TICKET_OVERDUE_DAYS (default 2) after waiting_since.
# "active" means staff asked the student something, so it is never overdue.
# chatbot_answer: read-only. Once a chatbot-answered ticket moves to staff
# (follow-up request or staff message), this holds the chatbot's answer
# (resolution is cleared then), so the app can still show "ChatDesk's
# answer". Null otherwise,
# including while the ticket is still chatbot-answered (use resolution then).
# message_count / last_staff_message_at: the ticket's conversation (see
# /messages/ below); the app uses last_staff_message_at for its "new reply"
# badge. None of these are on the original ERD.

Method,Path,Roles,Notes
GET,/api/v1/tickets/,admin,"List tickets. ?status=, ?category=, ?source=staff|ai (staff = needs/needed a person, ai = chatbot-answered), ?college=<key>, ?overdue=true, ?search= (title, question or ticket code), and (Super Admin) ?office=<id> or ?office=unassigned."
GET,/api/v1/tickets/,student,"Student's own tickets (staff and chatbot-answered). ?source=staff|ai."
POST,/api/v1/tickets/,student,Manual ticket creation (if student bypasses AI).
GET,/api/v1/tickets/{ticket_id}/,all,Detail view (students can only view their own).
PATCH,/api/v1/tickets/{ticket_id}/,admin,"Update ticket status, title, subject_category, or add resolution notes (resolved_by/resolved_at are set automatically on resolve). Resolving requires a non-empty resolution (400 under details.resolution); resolution max 5000. Replying to an AI-answered ticket moves it to staff (is_ai_resolved becomes false). Moving a resolved ticket back to pending or active clears resolved_at and resolved_by (whoever answers it next is recorded); the earlier resolution text is kept. Changing status to resolved emails the student the ticket code, their question and the answer (sent in the background after saving; a failed email doesn't undo the answer). Returns the full ticket."
POST,/api/v1/tickets/{ticket_id}/follow-up/,student,"""I still need help"" on an AI-answered ticket (own tickets only - others 404). Optional { ""message"": ""..."" } (max 1000). Reopens it as pending for staff with the same ticket_code, sets reopened_at, moves the chatbot's answer into conversation_context. 400 if the ticket is already with staff. Returns the ticket."
GET,/api/v1/tickets/{ticket_id}/messages/,all,"The ticket's conversation between student and staff, oldest first: [{ ""message_id"", ""ticket"", ""sender_role"": ""student""|""staff"", ""sender_name"", ""body"", ""created_at"" }]. Same access as the ticket (others 404). Students see staff as ""<office name> staff""; admins see the staff member's name."
POST,/api/v1/tickets/{ticket_id}/messages/,all,"{ ""body"": ""..."" } (required, max 2000). Staff message: a pending ticket becomes active (waiting on the student) and the student is emailed the message. On a chatbot-answered ticket it becomes a staff ticket that is active: is_ai_resolved false, the chatbot's answer moved into conversation_context, resolution/resolved_at/resolved_by cleared, reopened_at set. Student message: the ticket goes back to pending for staff (a resolved one is reopened, resolved_at and resolved_by cleared, the earlier resolution kept; a ticket already pending keeps its waiting_since). Students get 400 on a chatbot-answered ticket - they use follow-up first. Throttled 10/min per user. Returns the message (201)."

## Analytics (Admin Dashboard)

### GET /api/v1/analytics/overview/
Admin only. Optional ?date_from=, ?date_to= (YYYY-MM-DD), ?college=<key>, and
(Super Admin) ?office=<id> or ?office=unassigned.
{
  "total_inquiries": 128,
  "total_escalations": 34,
  "resolution_rate": 0.82,
  "intent_frequencies": [
    { "intent": "scholarship_requirements", "count": 45 },
    { "intent": "unresolved_complex_query", "count": 34 }
  ],
  "total_messages": 190,
  "other_interactions": [
    { "intent": "conversational", "count": 40 },
    { "intent": "needs_clarification", "count": 12 },
    { "intent": "off_topic", "count": 6 },
    { "intent": "unclear", "count": 3 },
    { "intent": "duplicate_ticket", "count": 1 }
  ],
  "tickets_by_status": { "pending": 5, "active": 3, "resolved": 26 },
  "ai_answered_tickets": 94,
  "overdue_tickets": 2,
  "avg_resolution_seconds": 183600,
  "offices": [
    {
      "office_id": 5,
      "office_name": "Office of Student Affairs (OSA)",
      "office_code": "OSA",
      "pending": 4,
      "active": 1,
      "resolved": 12,
      "ai_answered": 40,
      "overdue": 2,
      "oldest_pending_at": "2026-10-27T09:15:00Z",
      "oldest_pending_code": "OSA102726002",
      "avg_resolution_seconds": 97200
    }
  ]
}
# total_inquiries / total_escalations / intent_frequencies count only real
# questions (FAQ answers + escalations). Small talk, clarification prompts,
# off-topic, gibberish and repeats of an open ticket are in other_interactions;
# total_messages counts everything.
# tickets_by_status, resolution_rate and avg_resolution_seconds cover staff
# tickets only; chatbot-answered tickets are counted in ai_answered_tickets.
# offices: one row per office (plus an "Unassigned" row with office_id null
# when it has tickets), most overdue then most pending work first; Office
# Admins get only their own office. Resolution times are from reopened_at (if
# any) or created_at. overdue / overdue_tickets: see is_overdue under Tickets.

## Scheduled job: daily overdue reminder
`python manage.py send_overdue_reminders` (add --dry-run to preview) emails
each Office Admin the list of their office's overdue tickets ("You have 3
ChatDesk tickets waiting"), and each Super Admin the overdue tickets with no
office yet, plus those in an office that has no active Office Admin (so they
can reroute them or add an admin). Nothing is sent when there are none. Run it once a day from the
host's scheduler (cron, or a Cron Job / Scheduled Task on the hosting
platform). ADMIN_DASHBOARD_URL in backend/.env adds a link to the dashboard.

## Other endpoint behavior notes
- Offices have a "code" (2-10 uppercase letters/numbers, unique) that starts
  their ticket codes. Optional on create/edit - left blank, one is generated
  from the name (e.g. "Registrar" -> REG). Changing it doesn't change
  existing ticket codes.
- DELETE /api/v1/offices/{office_id}/ returns 400 (with a message) while the
  office still has Office Admin accounts - reassign them first. An Office Admin
  with no office gets 403 / empty results everywhere.
- Announcements: title and content required (not blank), content max 5000.
  Phases: name required (max 100), guidance_message max 500, at most 5
  suggested_questions of up to 200 characters each. suggested_questions is
  no longer used: the dashboard doesn't edit it, the calendar import doesn't
  fill it, and the app doesn't show it (the welcome screen shows the
  most-asked FAQs instead). It stays in the API so nothing breaks.
- Phases may overlap. GET /api/v1/phases/current/ uses today's Manila date and,
  when several phases are active, returns the most recently started one (the
  shorter one on a tie).



## Out of scope for this version (tracked for later contract revisions)
- OpenAI API prompt engineering and system instructions injection — Sprint 2
- System Usability Scale (SUS) survey data endpoints — Sprint 3 