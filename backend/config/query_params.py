"""Checked parsing of list-filter query parameters.

A filter such as ?office=abc or ?date_from=2026-13-45 used to reach the
database lookup as-is and crash the request with a 500. These helpers turn a
bad value into a normal 400 validation error instead."""

from datetime import date

from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError


def id_param(params, name):
    """The ?name= value as a positive int, None when absent, or a 400."""
    raw = params.get(name)
    if raw in (None, ""):
        return None
    # isascii(): "²" and other Unicode digits pass isdigit() but crash int().
    if not (raw.isascii() and raw.isdigit()) or int(raw) <= 0:
        raise ValidationError({name: ["Must be a number."]})
    return int(raw)


def office_param(params, name="office"):
    """?office=<id> or ?office=unassigned. Returns the int id, the string
    "unassigned", None when absent, or raises a 400."""
    raw = params.get(name)
    if raw == "unassigned":
        return raw
    return id_param(params, name)


def date_param(params, name):
    """The ?name= value as a date (YYYY-MM-DD), None when absent, or a 400."""
    raw = params.get(name)
    if raw in (None, ""):
        return None
    try:
        value = parse_date(raw)
    except ValueError:
        value = None
    if not isinstance(value, date):
        raise ValidationError({name: ["Use a valid date in YYYY-MM-DD format."]})
    return value
