"""File: backend/api/models.py
Facade module re-exporting split domain model groups.

This preserves backward compatibility for imports like:
    from api.models import Enrollment, Verification

Actual model definitions now live in:
  - domain_core.py
  - domain_courses.py
  - domain_enrollment.py
  - domain_documents.py
  - domain_verification.py

No schema / Meta changes performed in this facade.
"""

from .domain_core import *  # noqa: F401,F403
from .domain_courses import *  # noqa: F401,F403
from .domain_enrollment import *  # noqa: F401,F403
from .domain_documents import *  # noqa: F401,F403
from .domain_verification import *  # noqa: F401,F403
from .domain_letter import *  # noqa: F401,F403
from .domain_mail_request import *  # noqa: F401,F403
from .domain_transcript_generate import *  # noqa: F401,F403
from .domain_degree import *  # noqa: F401,F403
from .domain_cash_register import *  # noqa: F401,F403
from django.contrib.auth.models import User as DjangoAuthUser  # Export default auth user for serializers expecting it.

# Optional: define __all__ explicitly to aggregate from submodules
from .domain_core import __all__ as _core_all  # type: ignore
from .domain_courses import __all__ as _courses_all  # type: ignore
from .domain_enrollment import __all__ as _enroll_all  # type: ignore
from .domain_documents import __all__ as _docs_all  # type: ignore
from .domain_verification import __all__ as _ver_all  # type: ignore
from .domain_letter import __all__ as _letter_all  # type: ignore
from .domain_mail_request import __all__ as _mail_req_all  # type: ignore
from .domain_transcript_generate import __all__ as _transcript_all  # type: ignore
from .domain_degree import __all__ as _degree_all  # type: ignore
from .domain_cash_register import __all__ as _cash_register_all  # type: ignore

# Import leave management models directly
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
__all__ = [
  *_core_all,
  *_courses_all,
  *_enroll_all,
  *_docs_all,
  *_ver_all,
  *_letter_all,
  *_mail_req_all,
  *_transcript_all,
  *_degree_all,
  *_cash_register_all,
  'EmpProfile',
  'LeaveType',
  'LeaveEntry',
  'User',
]

# Backward compatibility: expose Django's default User model under expected name
User = DjangoAuthUser
