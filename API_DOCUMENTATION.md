# SimOps Backend API Documentation

## New Features Implementation

This document describes the 4 new features implemented in the SimOps backend.

---

## Feature 1: Dynamic Notifications Based on Job Date

### Endpoint: `GET /api/notifications`

Returns notifications for jobs scheduled for today that are incomplete.

**Query Parameters:** None

**Response:**
```json
{
  "date": "25/01/2026",
  "count": 2,
  "notifications": [
    {
      "id": "JOB-20260125120000",
      "namaPT": "PT Example",
      "jenisPekerjaan": "Maintenance",
      "namaPekerjaan": "username",
      "area": "Area A",
      "pj": "John Doe",
      "tanggal": "25/01/2026",
      "jamMulai": "08:00",
      "jamSelesai": "12:00",
      "statusDoc": "Belum Lengkap",
      "statusRisk": "Belum Dinilai",
      "message": "Dokumen belum lengkap"
    }
  ]
}
```

**Logic:**
- Filters jobs where `Tanggal_Kerja` equals today's date (dd/MM/yyyy format)
- Returns only incomplete jobs (`Status_Dokumen` != "Dokumen Tersimpan" OR `Status_Risiko` != "Sudah Dinilai")

---

## Feature 2: Area Filter in Recap Menu for Staff

### Updated Endpoint: `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "staff1",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "status": "Sukses",
  "role": "Staff",
  "username": "staff1",
  "area": "Area A",
  "statusAkun": "Active"
}
```

**Response (Pending Account):**
```json
{
  "status": "Gagal",
  "message": "Akun Anda masih menunggu persetujuan admin"
}
```

**Response (Rejected Account):**
```json
{
  "status": "Gagal",
  "message": "Akun Anda ditolak oleh admin"
}
```

### Updated Endpoint: `GET /api/rekap`

**Query Parameters:**
- `area` (optional): Filter jobs by specific area

**Example:**
```
GET /api/rekap?area=Area A
```

**Response:**
```json
[
  {
    "id": "JOB-20260125120000",
    "namaPT": "PT Example",
    "kompartemen": "Kompartemen 1",
    "unit": "Unit 1",
    "jenis": "Maintenance",
    "pekerjaan": "staff1",
    "area": "Area A",
    "pj": "John Doe",
    "tanggal": "25/01/2026",
    "jamMulai": "08:00",
    "jamSelesai": "12:00",
    "statusDoc": "Dokumen Tersimpan",
    "statusRisk": "Sudah Dinilai",
    "statusKelengkapan": "Lengkap",
    "riskData": { ... },
    "docs": [ ... ]
  }
]
```

**Logic:**
- If `area` parameter is provided, filters results to only jobs in that area
- Only returns jobs with `Status_Kelengkapan = "Lengkap"`

---

## Feature 3: Persist Incomplete Jobs (Auto-save & Resume)

### New Endpoint: `GET /api/jobs/incomplete`

Returns incomplete jobs for a specific user.

**Query Parameters:**
- `username` (required): Username of the staff member

**Example:**
```
GET /api/jobs/incomplete?username=staff1
```

**Response:**
```json
{
  "username": "staff1",
  "count": 1,
  "jobs": [
    {
      "id": "JOB-20260125120000",
      "timestamp": "25/01/2026 12:00:00",
      "namaPT": "PT Example",
      "kompartemen": "Kompartemen 1",
      "unit": "Unit 1",
      "jenisPekerjaan": "Maintenance",
      "namaPekerjaan": "staff1",
      "area": "Area A",
      "pj": "John Doe",
      "tanggal": "25/01/2026",
      "jamMulai": "08:00",
      "jamSelesai": "12:00",
      "statusDoc": "Belum Lengkap",
      "statusRisk": "Belum Dinilai",
      "statusKelengkapan": "Belum Lengkap"
    }
  ]
}
```

**Logic:**
- Filters jobs where `Nama_Petugas` matches the username
- Returns only jobs with `Status_Kelengkapan != "Lengkap"`

### Updated Behavior:

#### `/api/jobs` endpoint:
- Now creates jobs with `Status_Kelengkapan = "Belum Lengkap"` by default
- Saves to `DataPekerjaan!A:O` (including new column O)

#### `/api/upload` endpoint:
- After successful upload, checks if both `Status_Dokumen` and `Status_Risiko` are complete
- If both are complete, updates `Status_Kelengkapan = "Lengkap"`

#### `/api/risks` endpoint:
- After saving risk data, checks if both `Status_Dokumen` and `Status_Risiko` are complete
- If both are complete, updates `Status_Kelengkapan = "Lengkap"`

---

## Feature 4: Register Menu for Staff with Approval Workflow

### Updated Endpoint: `POST /api/auth/register`

**Request Body:**
```json
{
  "regUser": "newstaff",
  "regPass": "password123",
  "regRole": "Staff",
  "area": "Area B"
}
```

**Response:**
```json
{
  "message": "Registrasi berhasil! Menunggu persetujuan admin.",
  "status": "Pending"
}
```

**Logic:**
- Creates user with `Status_Akun = "Pending"` by default
- Sets `Tanggal_Registrasi` to current timestamp
- Leaves `Approved_By` and `Tanggal_Approval` empty
- Saves to `DataAkun!A:H` with all 8 columns

### New Endpoint: `GET /api/users/pending`

Returns all pending user registrations (for admin).

**Response:**
```json
{
  "count": 2,
  "users": [
    {
      "username": "newstaff",
      "role": "Staff",
      "area": "Area B",
      "statusAkun": "Pending",
      "tanggalRegistrasi": "25/01/2026 14:30:00"
    }
  ]
}
```

### New Endpoint: `PUT /api/users/:username/approve`

Approves a pending user registration (admin only).

**Request Body:**
```json
{
  "adminUsername": "admin1"
}
```

**Response:**
```json
{
  "message": "User approved successfully",
  "username": "newstaff",
  "approvedBy": "admin1",
  "approvedAt": "25/01/2026 15:00:00"
}
```

**Logic:**
- Sets `Status_Akun = "Active"`
- Sets `Approved_By` to admin username
- Sets `Tanggal_Approval` to current timestamp

### New Endpoint: `PUT /api/users/:username/reject`

Rejects a pending user registration (admin only).

**Response:**
```json
{
  "message": "User rejected successfully",
  "username": "newstaff"
}
```

**Logic:**
- Sets `Status_Akun = "Rejected"`

---

## Spreadsheet Schema Changes

### DataAkun Sheet (Updated to A:H)
- **A**: Username
- **B**: Password
- **C**: Role
- **D**: Area *(NEW)*
- **E**: Status_Akun (Pending/Active/Rejected) *(NEW)*
- **F**: Tanggal_Registrasi *(NEW)*
- **G**: Approved_By *(NEW)*
- **H**: Tanggal_Approval *(NEW)*

### DataPekerjaan Sheet (Updated to A:O)
- **A**: ID_Pekerjaan
- **B**: Timestamp
- **C**: Nama_PT
- **D**: Kompartemen
- **E**: Unit
- **F**: Jenis_Pekerjaan
- **G**: Nama_Petugas (Worker Username - maps to `namaPekerjaan` in API)
- **H**: Area
- **I**: Nama_PJ
- **J**: Tanggal_Kerja
- **K**: Jam_Mulai
- **L**: Jam_Selesai
- **M**: Status_Dokumen
- **N**: Status_Risiko
- **O**: Status_Kelengkapan (Belum Lengkap/Lengkap) *(NEW)*

**Note:** In the API requests, the field name `namaPekerjaan` represents the worker username (Nama_Petugas in the spreadsheet).

---

## Backward Compatibility

All changes maintain backward compatibility:

1. **Login**: Returns additional fields (`area`, `statusAkun`) but existing fields remain unchanged
2. **Register**: Accepts optional `area` parameter; works without it
3. **Rekap**: Works without `area` filter parameter; returns all complete jobs as before
4. **Jobs**: Existing functionality unchanged, only adds new column

---

## Testing Checklist

- [x] Endpoint `/api/notifications` returns only today's incomplete jobs
- [x] Login returns `area` and `statusAkun` fields
- [x] Login fails if `Status_Akun != "Active"`
- [x] Register staff with `Status_Akun = "Pending"`
- [x] Endpoint `/api/rekap` can be filtered by area
- [x] Endpoint `/api/jobs/incomplete` returns incomplete jobs
- [x] Update `Status_Kelengkapan` automatically when upload dokumen & risiko
- [x] Admin can approve/reject user registration
- [x] Admin can view pending registrations

---

## Error Handling

All endpoints include proper error handling:
- **400**: Bad Request (missing required parameters)
- **401**: Unauthorized (invalid credentials)
- **403**: Forbidden (account pending or rejected)
- **404**: Not Found (user not found)
- **500**: Internal Server Error (with error message)

---

## Date Format

All dates use the `date-fns` library with format `dd/MM/yyyy HH:mm:ss` for timestamps and `dd/MM/yyyy` for dates.
