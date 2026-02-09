import { useEffect, useRef } from "react";
import { getEnrollments } from "../services/enrollmentservice";

/**
 * SAFE common enrollment lookup hook
 * - Works with string | number | null | object
 * - No infinite loops
 * - Does NOT break other services
 */
export default function useEnrollmentLookup(enrollmentNo, onResolved) {
  const callbackRef = useRef(onResolved);

  // keep latest callback without retriggering effect
  useEffect(() => {
    callbackRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (enrollmentNo === null || enrollmentNo === undefined) {
      callbackRef.current?.(null);
      return;
    }

    const typed = String(enrollmentNo).trim();

    if (!typed || typed.length < 2) {
      callbackRef.current?.(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const data = await getEnrollments(typed, 1, 20);
        const items = data?.results || [];

        const exact = items.find(
          (e) =>
            String(e.enrollment_no || "")
              .trim()
              .toLowerCase() === typed.toLowerCase()
        );

        if (!cancelled) {
          callbackRef.current?.(exact || null);
        }
      } catch (err) {
        console.warn("Enrollment lookup failed", err);
        if (!cancelled) callbackRef.current?.(null);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [enrollmentNo]); // ✅ ONLY enrollmentNo
}
