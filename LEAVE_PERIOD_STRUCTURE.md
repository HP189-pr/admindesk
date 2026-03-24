# Leave Period Structure & Year-to-Date Mapping

## 1. LeavePeriod Model Structure

**Location:** [backend/api/domain_emp.py](backend/api/domain_emp.py#L213-L228)

```python
class LeavePeriod(models.Model):
    period_name = models.CharField(max_length=50)      # e.g., "2025-26", "FY24-Q4"
    start_date = models.DateField()                    # Period start date
    end_date = models.DateField()                      # Period end date
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = "api_leaveperiod"
        managed = False
```

### Key Characteristics:
- **Flexible period naming:** No fixed naming convention - `period_name` can be any string (2025, 2025-26, FY25-Q1, etc.)
- **Arbitrary date ranges:** Periods are not constrained to calendar years or fixed formats
- **No built-in mapping:** The model stores only the custom `period_name` and date range - no automatic year calculation
- **Optional description field:** Can document the period intent


## 2. Year-to-Date Mapping Query Logic

**Location:** [backend/reports/utils/leave_calendar.py](backend/reports/utils/leave_calendar.py#L44-L72)

```python
def resolve_period_window(year: int) -> Tuple[date, date, LeavePeriod | None]:
    """Return the configured fiscal period bounds for a given year if available."""
    
    # First try: period starting in the given year
    period = (
        LeavePeriod.objects.filter(start_date__year=year)
        .order_by("-start_date")
        .first()
    )
    
    # Second try: period ending in the given year
    if not period:
        period = (
            LeavePeriod.objects.filter(end_date__year=year)
            .order_by("-start_date")
            .first()
        )
    
    # Third try: period that overlaps the entire year
    if not period:
        period = (
            LeavePeriod.objects.filter(
                start_date__lte=date(year, 12, 31),
                end_date__gte=date(year, 1, 1),
            )
            .order_by("-start_date")
            .first()
        )
    
    # Fallback: return calendar year if no period found
    if period:
        return period.start_date, period.end_date, period
    
    return date(year, 1, 1), date(year, 12, 31), None
```

### Mapping Strategy:
1. **No hardcoded mapping** - lookup is dynamic based on database content
2. **Heuristic matching:** Tries multiple filters to find the period matching a given year
3. **Cascading fallback:** 
   - First tries year matching `start_date`
   - Then tries year matching `end_date`
   - Then tries period overlapping the calendar year
   - Finally defaults to Jan 1 - Dec 31 of that year


## 3. LeaveAllocation Model Structure

**Location:** [backend/api/domain_emp.py](backend/api/domain_emp.py#L234-L272)

```python
class LeaveAllocation(models.Model):
    APPLY_CHOICES = (
        ("All", "All Employees"),
        ("Particular", "Particular Employee"),
    )
    
    leave_code = models.CharField(max_length=20, db_column="leave_code")
    
    period = models.ForeignKey(LeavePeriod, on_delete=models.CASCADE, related_name="allocations")
    
    apply_to = models.CharField(max_length=20, choices=APPLY_CHOICES, default="All", db_column="apply_to")
    
    emp = models.ForeignKey(
        EmpProfile,
        to_field="emp_id",
        db_column="emp_id",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="specific_allocations"
    )
    
    allocated = models.DecimalField(max_digits=6, decimal_places=2, default=0)    # Days allocated
    allocated_start_date = models.DateField(null=True, blank=True)                # Optional: custom range start
    allocated_end_date = models.DateField(null=True, blank=True)                  # Optional: custom range end
    
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ("leave_code", "period", "emp")
```

### Key Points:
- **Period linking:** Each allocation is tied to a specific LeavePeriod
- **Global vs Employee-specific:** `apply_to` and `emp` fields determine if allocation is for all employees or specific one
- **Optional date range:** `allocated_start_date` and `allocated_end_date` allow override of period dates for prorating


## 4. Test Cases Show Period Patterns

**Location:** [backend/api/tests/test_leave_balances.py](backend/api/tests/test_leave_balances.py#L103-L160)

### Example Period Definitions:
```
Period 1: "2025-26" → 2025-07-01 to 2026-06-30 (Full fiscal year, July-June)
Period 2: "FY24-Q4" → 2025-04-01 to 2025-06-30 (Quarterly)
Period 3: "FY25-Q1" → 2025-07-01 to 2025-09-30 (Quarterly)
```

**Pattern observed:**
- **Fiscal Year Pattern:** `YYYY-YY` format (2025-26 = July 2025 to June 2026)
- **Start date:** June 30 / July 1 transition (not calendar year)
- **One-year rule:** Allocations don't apply in first 12 months of employment


## 5. Storage & Admin Interface

**Location:** [backend/api/admin.py](backend/api/admin.py#L56-L60)

```python
@admin.register(LeavePeriod)
class LeavePeriodAdmin(admin.ModelAdmin):
    list_display = ('period_name', 'start_date', 'end_date', 'created_at')
    search_fields = ('period_name',)
    list_filter = ('start_date',)
```

- Manually created and maintained in Django admin
- All periods stored in `api_leaveperiod` table
- Default `is_active=True` field (implicit from migration) for filtering


## 6. Period Management in Frontend

**Location:** [src/hooks/AuthLeave.jsx](src/hooks/AuthLeave.jsx#L495-L540)

Frontend provides CRUD interface for periods:
- Create: `period_name`, `start_date`, `end_date`, `description`
- Edit: All period fields
- Delete: Remove period (cascades to allocations)
- List: Display filtered by start_date


## 7. How Periods Are Used in Leave Engine

**Location:** [backend/api/leave_engine.py](backend/api/leave_engine.py#L93-L125)

```python
def load_periods(self) -> List[PeriodWindow]:
    qs = LeavePeriod.objects.all().order_by("start_date", "id")
    return [PeriodWindow.from_model(p) for p in qs]
```

### Processing Flow:
1. Load ALL periods from database (ordered by start_date)
2. For each period, load allocations
3. Split leave entries across period boundaries based on start/end dates
4. Calculate balances per period
5. Apply business rules (one-year rule, proration, carry-forward logic)


## 8. Current Database Pattern

### Expected Period Configuration (Not Found in Fixtures):
Currently, **NO hardcoded year-to-date mappings exist** in the codebase. The system is **completely flexible**:

- Periods must be manually created in Django admin or via API
- Common pattern observed from tests:
  ```
  2025 → 2025-07-01 to 2026-06-30 (Fiscal Year)
  2026 → 2026-07-01 to 2027-06-30 (Next Fiscal Year)
  ```

### Frontend Year Filter (for reference):
**Location:** [src/report/LeaveBalance.jsx](src/report/LeaveBalance.jsx#L330-L342)

```jsx
<select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
  <option value="">Select Year</option>
  <option value="2023">2023</option>
  <option value="2024">2024</option>
  <option value="2025">2025</option>
  <option value="2026">2026</option>
  <option value="2027">2027</option>
  <option value="2028">2028</option>
</select>
```

This is just UI-level filtering; actual resolution happens via `resolve_period_window()`.


## 9. Seed Command

**Location:** [backend/api/management/commands/seed_leave_allocations.py](backend/api/management/commands/seed_leave_allocations.py)

Seeds LeaveAllocation rows for all employees in an active period:
```bash
python manage.py seed_leave_allocations --period-id=1 --dry-run
```

Usage: Creates N allocations where N = num_employees × num_leave_types


## Summary

| Aspect | Details |
|--------|---------|
| **Model Flexibility** | Period names and date ranges are completely custom - no enforced format |
| **Year Mapping** | Dynamic database lookup, no hardcoded "2025 = 01-06-2025 to 31-05-2026" |
| **Storage** | Single `api_leaveperiod` table with period_name, start_date, end_date |
| **Allocation Scope** | Per period, globally or per employee |
| **Entry Splitting** | Leave entries split across period boundaries automatically |
| **Business Rules** | One-year waiting period, prorating on join/exit, CL reset, EL carry-forward |
| **Current Setup** | Likely using fiscal year (July-June) based on test patterns, but not enforced |

---

## To Configure Periods:

1. **Via Django Admin:** Navigate to `/admin/api/leaveperiod/` and create periods
2. **Via API:** POST to `/api/leave-periods/` with `period_name`, `start_date`, `end_date`
3. **Expected Data:** Create one period per allocation cycle (typically annual fiscal years)
