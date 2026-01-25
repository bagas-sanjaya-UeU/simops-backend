# Testing Guide for New SimOps Features

## Prerequisites

1. Ensure you have a Google Spreadsheet with the updated schema:
   - **DataAkun**: Columns A-H
   - **DataPekerjaan**: Columns A-O
   - **DataRisiko**: Columns A-F
   - **DokumenIzin**: Columns A-D

2. Update your `.env` file with:
   ```
   SPREADSHEET_ID=your_spreadsheet_id
   GOOGLE_KEY_FILE=./service-account.json
   ```

3. Make sure your service account has edit permissions on the spreadsheet

## Manual Testing with cURL

### 1. Test User Registration (Feature 4)

**Register a new staff:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "regUser": "teststaff",
    "regPass": "test123",
    "regRole": "Staff",
    "area": "Area A"
  }'
```

Expected: Should return status "Pending"

**Try to login with pending account:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teststaff",
    "password": "test123"
  }'
```

Expected: Should fail with "Akun Anda masih menunggu persetujuan admin"

**View pending registrations (as admin):**
```bash
curl http://localhost:5000/api/users/pending
```

Expected: Should show "teststaff" in the list

**Approve the registration (as admin):**
```bash
curl -X PUT http://localhost:5000/api/users/teststaff/approve \
  -H "Content-Type: application/json" \
  -d '{
    "adminUsername": "admin1"
  }'
```

Expected: Should return success message

**Login again with approved account:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teststaff",
    "password": "test123"
  }'
```

Expected: Should succeed and return area, statusAkun fields

### 2. Test Incomplete Jobs Persistence (Feature 3)

**Create a new job:**
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "namaPT": "PT Test",
    "kompartemen": "Kompartemen A",
    "unit": "Unit 1",
    "jenisPekerjaan": "Maintenance",
    "namaPekerjaan": "teststaff",
    "area": "Area A",
    "pjNama": "John Doe",
    "tanggalKerja": "2026-01-25",
    "jamMulai": "08:00",
    "jamSelesai": "12:00"
  }'
```

**Note:** The field `namaPekerjaan` represents the worker/staff username (Nama_Petugas in the spreadsheet).

Expected: Returns job ID like "JOB-20260125120000"

**Get incomplete jobs for teststaff:**
```bash
curl "http://localhost:5000/api/jobs/incomplete?username=teststaff"
```

Expected: Should show the job created above with statusKelengkapan = "Belum Lengkap"

**Upload risk assessment (use job ID from above):**
```bash
curl -X POST http://localhost:5000/api/risks \
  -H "Content-Type: application/json" \
  -d '{
    "idPekerjaan": "JOB-20260125120000",
    "dataRisiko": [
      {
        "aktivitas": "Test Activity",
        "bahaya": "Test Hazard",
        "l": "2",
        "c": "3",
        "rr": "6"
      }
    ]
  }'
```

Expected: Status_Risiko should be updated to "Sudah Dinilai"

**Note:** After uploading documents via `/api/upload` (requires actual file), the Status_Kelengkapan should automatically update to "Lengkap"

### 3. Test Notifications (Feature 1)

**Get today's notifications:**
```bash
curl http://localhost:5000/api/notifications
```

Expected: Should return jobs scheduled for today that are incomplete

**Verify the date filter:**
- Only jobs with Tanggal_Kerja matching today's date should appear
- Only incomplete jobs should appear (Status_Dokumen != "Dokumen Tersimpan" OR Status_Risiko != "Sudah Dinilai")

### 4. Test Area Filter (Feature 2)

**Get all complete jobs (no filter):**
```bash
curl http://localhost:5000/api/rekap
```

Expected: Returns all jobs with Status_Kelengkapan = "Lengkap"

**Filter by area:**
```bash
curl "http://localhost:5000/api/rekap?area=Area%20A"
```

Expected: Returns only complete jobs in "Area A"

**Filter by different area:**
```bash
curl "http://localhost:5000/api/rekap?area=Area%20B"
```

Expected: Returns only complete jobs in "Area B"

## Testing with Postman

### Import Collection

Create a new Postman collection with these requests:

1. **Register Staff**
   - Method: POST
   - URL: `{{baseUrl}}/api/auth/register`
   - Body: JSON
   ```json
   {
     "regUser": "staff1",
     "regPass": "pass123",
     "regRole": "Staff",
     "area": "Area A"
   }
   ```

2. **Login**
   - Method: POST
   - URL: `{{baseUrl}}/api/auth/login`
   - Body: JSON
   ```json
   {
     "username": "staff1",
     "password": "pass123"
   }
   ```

3. **Get Pending Users**
   - Method: GET
   - URL: `{{baseUrl}}/api/users/pending`

4. **Approve User**
   - Method: PUT
   - URL: `{{baseUrl}}/api/users/staff1/approve`
   - Body: JSON
   ```json
   {
     "adminUsername": "admin"
   }
   ```

5. **Get Notifications**
   - Method: GET
   - URL: `{{baseUrl}}/api/notifications`

6. **Get Incomplete Jobs**
   - Method: GET
   - URL: `{{baseUrl}}/api/jobs/incomplete?username=staff1`

7. **Get Rekap (All)**
   - Method: GET
   - URL: `{{baseUrl}}/api/rekap`

8. **Get Rekap (Filtered by Area)**
   - Method: GET
   - URL: `{{baseUrl}}/api/rekap?area=Area A`

### Environment Variables

Set up these variables:
- `baseUrl`: `http://localhost:5000`

## Verification Checklist

After running tests, verify in the Google Spreadsheet:

### DataAkun Sheet
- [ ] New users have 8 columns populated
- [ ] New registrations have Status_Akun = "Pending"
- [ ] Approved users have Status_Akun = "Active", Approved_By, and Tanggal_Approval filled
- [ ] Rejected users have Status_Akun = "Rejected"

### DataPekerjaan Sheet
- [ ] New jobs have 15 columns populated (A-O)
- [ ] New jobs have Status_Kelengkapan = "Belum Lengkap"
- [ ] Jobs with both documents and risks have Status_Kelengkapan = "Lengkap"

### DataRisiko Sheet
- [ ] Risk assessments are saved correctly with job ID reference

## Common Issues and Solutions

### Issue: Login still works with Pending account
**Solution:** Check that the spreadsheet has Status_Akun column (column E) populated. Empty values default to "Active" for backward compatibility.

### Issue: Status_Kelengkapan not updating to "Lengkap"
**Solution:** 
1. Verify both Status_Dokumen = "Dokumen Tersimpan" AND Status_Risiko = "Sudah Dinilai"
2. Check that the GAS script properly updates Status_Dokumen
3. Verify the checkAndUpdateKelengkapan function is called after upload/risk submission

### Issue: Rekap returns empty array
**Solution:** 
1. Check that jobs have Status_Kelengkapan = "Lengkap"
2. Verify the spreadsheet range is updated to A2:O
3. Check that both documents and risks are uploaded for the job

### Issue: Area filter not working
**Solution:**
1. Ensure Area column (column H in DataPekerjaan) is populated
2. Check URL encoding for area parameter (e.g., "Area A" → "Area%20A")

## Automated Testing (Future)

For automated testing, consider:
1. Creating a test spreadsheet
2. Using Jest or Mocha for unit tests
3. Mocking Google Sheets API responses
4. Testing each endpoint independently

## Performance Testing

To test performance:
1. Create multiple jobs (100+)
2. Test notification endpoint response time
3. Test incomplete jobs query with multiple users
4. Monitor Google Sheets API quota usage
