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
  "unit": "Unit Produksi",
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

**Changes:**
- Now returns `unit` field in addition to `area`
- Reads from `DataAkun!A2:I` range

### Updated Endpoint: `GET /api/rekap`

**Query Parameters:**
- `area` (optional): Filter jobs by specific area
- `unit` (optional): Filter jobs by specific unit

**Example:**
```
GET /api/rekap?area=Area A
GET /api/rekap?unit=Unit%20Produksi
GET /api/rekap?area=Area A&unit=Unit%20Produksi
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
- If `unit` parameter is provided, filters results to only jobs in that unit
- Both filters can be combined
- Only returns jobs with `Status_Kelengkapan = "Lengkap"`

---

## Feature 5: SIMOPS Risk Control (Admin)

### New Endpoint: `GET /api/simops/conflicts`

Detects jobs with overlapping time slots in the same area.

**Query Parameters:**
- `date` (required): Date in dd/MM/yyyy format
- `area` (required): Area name

**Example:**
```
GET /api/simops/conflicts?date=26/01/2026&area=Area%20A
```

**Response:**
```json
{
  "date": "26/01/2026",
  "area": "Area A",
  "conflicts": [
    {
      "timeSlot": "08:00-12:00",
      "jobs": [
        {
          "id": "JOB-20260126080000",
          "namaPT": "PT ABC",
          "area": "Area A",
          "jamMulai": "08:00",
          "jamSelesai": "12:00"
        },
        {
          "id": "JOB-20260126081500",
          "namaPT": "PT XYZ",
          "area": "Area A",
          "jamMulai": "08:00",
          "jamSelesai": "12:00"
        }
      ]
    }
  ]
}
```

**Logic:**
- Filters jobs by date and area from DataPekerjaan sheet
- Groups jobs with overlapping time slots
- Returns conflict groups with 2 or more jobs

### New Endpoint: `POST /api/simops/mitigasi-ganti-jam`

Saves time change mitigation for conflicting jobs.

**Request Body:**
```json
{
  "simopsId": "SIM-26011200",
  "area": "Area A",
  "changes": [
    {
      "jobId": "JOB-20260126080000",
      "jamMulai": "08:00",
      "jamSelesai": "10:00"
    },
    {
      "jobId": "JOB-20260126081500",
      "jamMulai": "10:30",
      "jamSelesai": "12:30"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Mitigasi ganti jam berhasil disimpan",
  "simopsId": "SIM-26011200",
  "changes": [
    {
      "jobId": "JOB-20260126080000",
      "jamMulai": "08:00",
      "jamSelesai": "10:00"
    },
    {
      "jobId": "JOB-20260126081500",
      "jamMulai": "10:30",
      "jamSelesai": "12:30"
    }
  ]
}
```

**Logic:**
- Updates RekapSIMOPS column E (Keputusan_Pengendalian) to "Ganti Jam"
- Updates RekapSIMOPS column H (Waktu_Input) with JSON changes
- Updates job times in DataPekerjaan (columns K and L)

### New Endpoint: `POST /api/simops/mitigasi-lainnya`

Saves other mitigation details.

**Request Body:**
```json
{
  "simopsId": "SIM-26011200",
  "area": "Area A",
  "namaSO": ["SO 1", "SO 2"],
  "namaSI": ["SI 1"],
  "leader": "John Doe",
  "jumlahPekerja": 15
}
```

**Response:**
```json
{
  "message": "Mitigasi lainnya berhasil disimpan",
  "simopsId": "SIM-26011200",
  "data": {
    "namaSO": ["SO 1", "SO 2"],
    "namaSI": ["SI 1"],
    "leader": "John Doe",
    "jumlahPekerja": 15
  }
}
```

**Logic:**
- Updates RekapSIMOPS column E (Keputusan_Pengendalian) to "Mitigasi Lainnya"
- Updates RekapSIMOPS column G (Detail_Mitigasi_JSON) with JSON data

### New Endpoint: `GET /api/simops/rekap`

Gets SIMOPS recap data.

**Query Parameters:**
- `simopsId` (optional): Filter by specific SIMOPS ID

**Example:**
```
GET /api/simops/rekap
GET /api/simops/rekap?simopsId=SIM-26011200
```

**Response:**
```json
{
  "count": 1,
  "data": [
    {
      "idSimops": "SIM-26011200",
      "tanggal": "26/01/2026",
      "area": "Area A",
      "konflikAntara": "PT ABC, PT XYZ",
      "keputusanPengendalian": "Ganti Jam",
      "dataRisiko": {
        "apdTambahan": ["Helmet", "Gloves"]
      },
      "detailMitigasi": {
        "namaSO": ["SO 1", "SO 2"],
        "namaSI": ["SI 1"],
        "leader": "John Doe",
        "jumlahPekerja": 15
      },
      "waktuInput": "[{\"jobId\":\"JOB-001\",\"jamMulai\":\"08:00\",\"jamSelesai\":\"10:00\"}]"
    }
  ]
}
```

**Logic:**
- Retrieves all records from RekapSIMOPS sheet
- Parses JSON fields (dataRisiko, detailMitigasi)
- Filters by simopsId if provided

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

### DataAkun Sheet (Updated to A:I)
- **A**: Username
- **B**: Password
- **C**: Role
- **D**: Area
- **E**: Unit *(NEW)*
- **F**: Status_Akun (Pending/Active/Rejected)
- **G**: Tanggal_Registrasi
- **H**: Approved_By
- **I**: Tanggal_Approval

### DataPekerjaan Sheet (A:O)
- **A**: ID_Pekerjaan
- **B**: Timestamp
- **C**: Kompartemen
- **D**: Unit
- **E**: Nama_PT
- **F**: Jenis_Pekerjaan
- **G**: Nama_Petugas (Worker Username - maps to `namaPekerjaan` in API)
- **H**: Area
- **I**: Nama_PJ
- **J**: Tanggal_Kerja
- **K**: Jam_Mulai
- **L**: Jam_Selesai
- **M**: Status_Dokumen
- **N**: Status_Risiko
- **O**: Status_Kelengkapan (Belum Lengkap/Lengkap)

### RekapSIMOPS Sheet (A:H)
- **A**: ID_Simops
- **B**: Tanggal
- **C**: Area
- **D**: Konflik_Antara
- **E**: Keputusan_Pengendalian (Ganti Jam/Mitigasi Lainnya)
- **F**: Data_Risiko_JSON
- **G**: Detail_Mitigasi_JSON
- **H**: Waktu_Input (JSON with time changes)

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
- [x] Login returns `area`, `unit`, and `statusAkun` fields
- [x] Login fails if `Status_Akun != "Active"`
- [x] Register staff with `Status_Akun = "Pending"`
- [x] Endpoint `/api/rekap` can be filtered by area
- [x] Endpoint `/api/rekap` can be filtered by unit
- [x] Endpoint `/api/rekap` can be filtered by both area and unit
- [x] Endpoint `/api/jobs/incomplete` returns incomplete jobs
- [x] Update `Status_Kelengkapan` automatically when upload dokumen & risiko
- [x] Admin can approve/reject user registration
- [x] Admin can view pending registrations
- [x] Endpoint `/api/simops/conflicts` detects time conflicts correctly
- [x] Endpoint `/api/simops/mitigasi-ganti-jam` saves time changes
- [x] Endpoint `/api/simops/mitigasi-lainnya` saves mitigation details
- [x] Endpoint `/api/simops/rekap` retrieves SIMOPS data

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
