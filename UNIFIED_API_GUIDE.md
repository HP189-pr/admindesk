# Unified API System - Complete Guide

This guide shows how to use the unified CRUD APIs for DocRec and all service types (Verification, Migration, Provisional, InstVerification).

## API Endpoints Overview

### 1. Unified APIs (from DocReceive page)
- `POST /api/docrec/unified-update/` - Update DocRec + any service atomically
- `POST /api/docrec/unified-delete/` - Delete DocRec + any service atomically

### 2. Service-Only APIs (from individual service pages)
- `POST /api/verification/update-service-only/` - Update Verification only
- `POST /api/migration/update-service-only/` - Update Migration only
- `POST /api/provisional/update-service-only/` - Update Provisional only
- `POST /api/instverification/update-service-only/` - Update InstVerification only

---

## 1. Unified Update (DocReceive Page)

### Use Case
User editing both DocRec and service details from the DocReceive page.

### Endpoint
`POST /api/docrec/unified-update/`

### Payload Structure
```javascript
{
  doc_rec_id: "vr_25_0201",           // Required: unique doc_rec identifier
  service_type: "VR",                 // Required: "VR" | "PR" | "MG" | "IV"
  doc_rec: {                          // Optional: DocRec fields to update
    apply_for: "Transcript",
    pay_by: "Online",
    pay_amount: 500,
    doc_rec_date: "2025-01-15",
    doc_rec_remark: "Urgent request"
  },
  service: {                          // Optional: Service-specific fields
    // For VR (Verification):
    enrollment_no: "2019010123",
    student_name: "John Doe",
    tr_count: 2,
    ms_count: 1,
    // ... other verification fields
    
    // For PR (Provisional):
    enrollment: 123,                  // enrollment FK id
    student_name: "Jane Smith",
    prv_number: "PR_2025_001",
    // ... other provisional fields
    
    // For MG (Migration):
    enrollment: 456,
    student_name: "Bob Wilson",
    mg_number: "MG_2025_001",
    // ... other migration fields
    
    // For IV (InstVerification):
    inst_veri_number: "IV_2025_001",
    rec_inst_name: "ABC Institute",
    // ... other inst verification fields
  }
}
```

### Frontend Example (doc-receive.jsx)

```javascript
// Function to update DocRec + Service atomically
const updateDocRecWithService = async (docRecId, serviceType, docRecData, serviceData) => {
  try {
    const response = await fetch('/api/docrec/unified-update/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        doc_rec_id: docRecId,
        service_type: serviceType,  // "VR", "PR", "MG", or "IV"
        doc_rec: docRecData,        // Can be empty {} if not updating doc_rec
        service: serviceData        // Can be empty {} if not updating service
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Update failed');
    }

    const result = await response.json();
    console.log('Updated:', result);
    // result = {
    //   message: "DocRec and Verification updated successfully",
    //   doc_rec_id: "vr_25_0201",
    //   service_type: "VR",
    //   service_id: 123,
    //   service_found: true
    // }
    
    alert('Record updated successfully!');
    return result;
  } catch (error) {
    console.error('Update error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};

// Example usage - Update both DocRec and Verification
updateDocRecWithService(
  "vr_25_0201",
  "VR",
  {
    apply_for: "Transcript",
    pay_amount: 500,
    doc_rec_date: "2025-01-15"
  },
  {
    enrollment_no: "2019010123",
    student_name: "John Doe",
    tr_count: 2,
    ms_count: 1
  }
);

// Example usage - Update only service (empty doc_rec)
updateDocRecWithService(
  "vr_25_0201",
  "VR",
  {},  // Not updating doc_rec
  {
    tr_count: 3,  // Just increment transcript count
    ms_count: 2
  }
);
```

---

## 2. Unified Delete (DocReceive Page)

### Use Case
User deleting both DocRec and its associated service record together.

### Endpoint
`POST /api/docrec/unified-delete/`

### Payload Structure
```javascript
{
  doc_rec_id: "vr_25_0201",    // Required
  service_type: "VR"           // Required: "VR" | "PR" | "MG" | "IV"
}
```

### Frontend Example (doc-receive.jsx)

```javascript
const deleteDocRecWithService = async (docRecId, serviceType) => {
  if (!confirm('Are you sure you want to delete this record and its service data?')) {
    return;
  }

  try {
    const response = await fetch('/api/docrec/unified-delete/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        doc_rec_id: docRecId,
        service_type: serviceType
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Delete failed');
    }

    const result = await response.json();
    console.log('Deleted:', result);
    // result = {
    //   message: "Verification and DocRec deleted successfully",
    //   doc_rec_id: "vr_25_0201",
    //   service_type: "VR",
    //   service_found: true
    // }
    
    alert('Record deleted successfully!');
    // Refresh the list
    fetchDocRecords();
    return result;
  } catch (error) {
    console.error('Delete error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};

// Example usage
deleteDocRecWithService("vr_25_0201", "VR");
deleteDocRecWithService("pr_25_0145", "PR");
deleteDocRecWithService("mg_25_0089", "MG");
deleteDocRecWithService("iv_25_0012", "IV");
```

---

## 3. Service-Only Update (Individual Service Pages)

### Use Case
User editing service details from verification.jsx, migration.jsx, etc. without touching DocRec.

### Endpoints
- `POST /api/verification/update-service-only/`
- `POST /api/migration/update-service-only/`
- `POST /api/provisional/update-service-only/`
- `POST /api/instverification/update-service-only/`

### Payload Structure
```javascript
{
  id: 123,                    // Required: service record primary key
  // ... any service fields to update
}
```

### Frontend Example (verification.jsx)

```javascript
const updateVerificationOnly = async (verificationId, formData) => {
  try {
    const response = await fetch('/api/verification/update-service-only/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: verificationId,
        enrollment_no: formData.enrollment_no,
        student_name: formData.student_name,
        tr_count: formData.tr_count,
        ms_count: formData.ms_count,
        pr_count: formData.pr_count,
        pc_count: formData.pc_count,
        eca_required: formData.eca_required,
        eca_name: formData.eca_required ? formData.eca_name : null,
        eca_address: formData.eca_required ? formData.eca_address : null,
        eca_email: formData.eca_required ? formData.eca_email : null,
        amount: formData.amount,
        issue_date: formData.issue_date ? formData.issue_date.split('T')[0] : null,
        veri_remark: formData.veri_remark
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const result = await response.json();
    console.log('Updated:', result);
    // result = {
    //   message: "Verification updated successfully",
    //   id: 123,
    //   doc_rec_id: "vr_25_0201"
    // }
    
    alert('Verification updated successfully!');
    return result;
  } catch (error) {
    console.error('Update error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};

// Example usage in your form submit handler
const handleSubmit = (e) => {
  e.preventDefault();
  if (isEditMode) {
    updateVerificationOnly(currentRecord.id, formData);
  } else {
    createVerification(formData);  // Use existing create endpoint
  }
};
```

### Frontend Example (migration.jsx)

```javascript
const updateMigrationOnly = async (migrationId, formData) => {
  try {
    const response = await fetch('/api/migration/update-service-only/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: migrationId,
        enrollment: formData.enrollment_id,  // FK to Enrollment
        student_name: formData.student_name,
        mg_number: formData.mg_number,
        institute: formData.institute_id,
        amount: formData.amount,
        issue_date: formData.issue_date ? formData.issue_date.split('T')[0] : null,
        mg_remark: formData.mg_remark
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const result = await response.json();
    alert('Migration record updated successfully!');
    return result;
  } catch (error) {
    console.error('Update error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};
```

### Frontend Example (provisional.jsx)

```javascript
const updateProvisionalOnly = async (provisionalId, formData) => {
  try {
    const response = await fetch('/api/provisional/update-service-only/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: provisionalId,
        enrollment: formData.enrollment_id,
        student_name: formData.student_name,
        prv_number: formData.prv_number,
        institute: formData.institute_id,
        amount: formData.amount,
        issue_date: formData.issue_date ? formData.issue_date.split('T')[0] : null,
        prv_remark: formData.prv_remark
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const result = await response.json();
    alert('Provisional record updated successfully!');
    return result;
  } catch (error) {
    console.error('Update error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};
```

### Frontend Example (inst-verification.jsx)

```javascript
const updateInstVerificationOnly = async (instVerificationId, formData) => {
  try {
    const response = await fetch('/api/instverification/update-service-only/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: instVerificationId,
        inst_veri_number: formData.inst_veri_number,
        rec_inst_name: formData.rec_inst_name,
        inst_ref_no: formData.inst_ref_no,
        iv_remark: formData.iv_remark,
        amount: formData.amount,
        issue_date: formData.issue_date ? formData.issue_date.split('T')[0] : null
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const result = await response.json();
    alert('InstVerification updated successfully!');
    return result;
  } catch (error) {
    console.error('Update error:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
};
```

---

## 4. Complete React Hook Example

Here's a reusable custom hook for service-only updates:

```javascript
// hooks/useServiceUpdate.js
import { useState } from 'react';

const SERVICE_ENDPOINTS = {
  VR: '/api/verification/update-service-only/',
  PR: '/api/provisional/update-service-only/',
  MG: '/api/migration/update-service-only/',
  IV: '/api/instverification/update-service-only/'
};

export const useServiceUpdate = (serviceType) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateService = async (serviceId, data) => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = SERVICE_ENDPOINTS[serviceType];
      if (!endpoint) {
        throw new Error(`Invalid service type: ${serviceType}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          id: serviceId,
          ...data
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const result = await response.json();
      setLoading(false);
      return result;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  return { updateService, loading, error };
};

// Usage in verification.jsx
import { useServiceUpdate } from '../hooks/useServiceUpdate';

const VerificationPage = () => {
  const { updateService, loading, error } = useServiceUpdate('VR');
  
  const handleUpdate = async (id, formData) => {
    try {
      const result = await updateService(id, formData);
      alert('Updated successfully!');
      // Refresh list or update state
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // ... rest of component
};
```

---

## 5. Error Handling Best Practices

```javascript
const handleAPICall = async (apiFunction) => {
  try {
    const result = await apiFunction();
    return { success: true, data: result };
  } catch (error) {
    // Parse error message
    let errorMessage = 'An error occurred';
    
    try {
      const errorData = JSON.parse(error.message);
      if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.non_field_errors) {
        errorMessage = errorData.non_field_errors.join(', ');
      } else {
        errorMessage = JSON.stringify(errorData);
      }
    } catch {
      errorMessage = error.message;
    }
    
    return { success: false, error: errorMessage };
  }
};

// Usage
const result = await handleAPICall(() => 
  updateVerificationOnly(123, formData)
);

if (result.success) {
  alert('Success!');
} else {
  alert(`Error: ${result.error}`);
}
```

---

## 6. Transaction Safety

All unified APIs use `transaction.atomic()` to ensure data consistency:

- **Update**: Both DocRec and service are updated together. If service update fails, DocRec changes are rolled back.
- **Delete**: Service is deleted first, then DocRec. If DocRec deletion fails, service deletion is rolled back.
- **InstVerification**: Student records are automatically cascade-deleted with the main record.

---

## 7. Testing Checklist

### For each service type (VR, PR, MG, IV):

1. **Create Flow** (existing endpoints)
   - [ ] Create DocRec + Service from DocReceive page
   - [ ] Create Service only from service-specific page

2. **Update Flow**
   - [ ] Update both DocRec + Service using `unified-update`
   - [ ] Update only Service using `update-service-only`
   - [ ] Verify transaction rollback on validation errors

3. **Delete Flow**
   - [ ] Delete both DocRec + Service using `unified-delete`
   - [ ] Verify cascade delete for InstVerification students

4. **Edge Cases**
   - [ ] Update with empty `doc_rec` object (should update service only)
   - [ ] Update with empty `service` object (should update doc_rec only)
   - [ ] Delete non-existent record (should return 404)
   - [ ] Update with invalid data (should return 400 with validation errors)

---

## 8. Quick Reference

| Operation | Location | Endpoint | Service Type Param |
|-----------|----------|----------|-------------------|
| Update Both | DocReceive | `/api/docrec/unified-update/` | Yes (`VR`/`PR`/`MG`/`IV`) |
| Delete Both | DocReceive | `/api/docrec/unified-delete/` | Yes (`VR`/`PR`/`MG`/`IV`) |
| Update Service Only | Verification | `/api/verification/update-service-only/` | No |
| Update Service Only | Migration | `/api/migration/update-service-only/` | No |
| Update Service Only | Provisional | `/api/provisional/update-service-only/` | No |
| Update Service Only | InstVerification | `/api/instverification/update-service-only/` | No |

---

## Notes

- All dates should be in `YYYY-MM-DD` format (use `.split('T')[0]` on datetime strings)
- For Verification: `enrollment_no` and `second_enrollment_id` are strings, not FK IDs
- For Migration/Provisional: `enrollment` and `institute` are FK IDs (integers)
- Always include `Authorization` header with Bearer token
- `eca_required` determines whether ECA fields are validated in Verification
