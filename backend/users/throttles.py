from rest_framework.throttling import SimpleRateThrottle


class EmailRateThrottle(SimpleRateThrottle):
    """Rate-limits by the email in the request body rather than by IP, so
    one account can't be hammered from many addresses and a shared campus IP
    doesn't lock everyone out. Rate comes from view.email_throttle_scope."""

    def __init__(self):
        # Rate is resolved per view in allow_request, not at construction.
        pass

    def allow_request(self, request, view):
        self.scope = getattr(view, "email_throttle_scope", None)
        if not self.scope:
            return True
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "")).strip().lower()
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}
