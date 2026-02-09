import { useEffect } from 'react';
import { resolveEnrollment } from '../services/enrollmentService';

/**
 * Common enrollment lookup hook
 * - Debounced
 * - Exact match only
 * - Reusable across Degree, DocReceive, Verification, etc.
 */
export default function useEnrollmentLookup(enrollmentNo, onResult) {
  useEffect(() => {
    const en = (enrollmentNo || '').trim();

    // Clear when empty
    if (!en) {
      onResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const enr = await resolveEnrollment(en);
        onResult(enr);
      } catch (e) {
        console.warn('useEnrollmentLookup error', e);
        onResult(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [enrollmentNo]);
}
