import re

_SKIP_WORDS = {"and", "of", "the", "for"}


def suggest_code(name):
    """"Office of Student Affairs (OSA)" -> OSA, "ARCU" -> ARCU,
    "Registrar" -> REG, "Guidance & Counseling Services" -> GCS."""
    in_parentheses = re.search(r"\(([A-Za-z0-9]{2,10})\)", name)
    if in_parentheses:
        return in_parentheses.group(1).upper()
    words = [w for w in re.findall(r"[A-Za-z0-9]+", name) if w.lower() not in _SKIP_WORDS]
    if not words:
        return "OFF"
    if len(words) == 1:
        word = words[0]
        return word.upper() if word.isupper() and len(word) <= 10 else word[:3].upper()
    initials = "".join(w[0] for w in words).upper()
    return initials[:10] if len(initials) >= 2 else words[0][:3].upper()


def unique_code(base, taken):
    """base, then base2, base3... - whichever isn't in `taken`."""
    code, n = base, 2
    while code in taken:
        code = f"{base[:8]}{n}"
        n += 1
    return code
