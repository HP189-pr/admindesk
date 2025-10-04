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

# Optional: define __all__ explicitly to aggregate from submodules
from .domain_core import __all__ as _core_all  # type: ignore
from .domain_courses import __all__ as _courses_all  # type: ignore
from .domain_enrollment import __all__ as _enroll_all  # type: ignore
from .domain_documents import __all__ as _docs_all  # type: ignore
from .domain_verification import __all__ as _ver_all  # type: ignore

__all__ = [*_core_all, *_courses_all, *_enroll_all, *_docs_all, *_ver_all]


    def save(self, *args, **kwargs):
        # Auto-copy pay_rec_no from DocRec if not explicitly provided
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Provisional {self.prv_number} ({self.student_name})"