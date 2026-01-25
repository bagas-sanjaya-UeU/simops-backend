# Migration Guide: Updating Spreadsheet Schema

This guide will help you update your Google Spreadsheet to support the new features.

## Overview

The new implementation requires schema changes to two sheets:
1. **DataAkun**: From 3 columns (A-C) to 8 columns (A-H)
2. **DataPekerjaan**: From 14 columns (A-N) to 15 columns (A-O)

## Pre-Migration Checklist

- [ ] Backup your current spreadsheet (File → Make a copy)
- [ ] Note down your spreadsheet ID
- [ ] Ensure you have edit access to the spreadsheet
- [ ] Verify service account has edit permissions

## Migration Steps

### Step 1: Update DataAkun Sheet

#### 1.1 Add New Column Headers

Add these headers to row 1 of the DataAkun sheet:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Username | Password | Role | Area | Status_Akun | Tanggal_Registrasi | Approved_By | Tanggal_Approval |

#### 1.2 Migrate Existing Data

For each existing user row (starting from row 2):

1. Leave columns A, B, C as they are (Username, Password, Role)
2. Add default values for new columns:
   - **Column D (Area)**: Add the user's area, or leave empty if not applicable
   - **Column E (Status_Akun)**: Set to "Active" for existing users
   - **Column F (Tanggal_Registrasi)**: Leave empty or add registration date if known
   - **Column G (Approved_By)**: Leave empty or add "System Migration"
   - **Column H (Tanggal_Approval)**: Leave empty or add current date

#### Example Migration:

**Before:**
| A | B | C |
|---|---|---|
| admin | admin123 | Admin |
| staff1 | pass123 | Staff |

**After:**
| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| admin | admin123 | Admin | All Areas | Active | 01/01/2026 00:00:00 | System Migration | 01/01/2026 00:00:00 |
| staff1 | pass123 | Staff | Area A | Active | 01/01/2026 00:00:00 | System Migration | 01/01/2026 00:00:00 |

### Step 2: Update DataPekerjaan Sheet

#### 2.1 Add New Column Header

Add this header to column O (row 1) of the DataPekerjaan sheet:

| O |
|---|
| Status_Kelengkapan |

#### 2.2 Migrate Existing Data

For each existing job row (starting from row 2):

1. Leave columns A-N as they are
2. Add value for column O (Status_Kelengkapan):
   - If both Status_Dokumen (M) = "Dokumen Tersimpan" AND Status_Risiko (N) = "Sudah Dinilai", set to "Lengkap"
   - Otherwise, set to "Belum Lengkap"

#### Using a Formula (Recommended):

You can use this formula in column O to automatically calculate the status:

```excel
=IF(AND(M2="Dokumen Tersimpan",N2="Sudah Dinilai"),"Lengkap","Belum Lengkap")
```

Then drag the formula down for all rows.

#### Example Migration:

**Before:**
| A | B | ... | M | N |
|---|---|---|---|---|
| JOB-001 | 25/01/2026 12:00:00 | ... | Dokumen Tersimpan | Sudah Dinilai |
| JOB-002 | 25/01/2026 13:00:00 | ... | Belum Lengkap | Belum Dinilai |

**After:**
| A | B | ... | M | N | O |
|---|---|---|---|---|---|
| JOB-001 | 25/01/2026 12:00:00 | ... | Dokumen Tersimpan | Sudah Dinilai | Lengkap |
| JOB-002 | 25/01/2026 13:00:00 | ... | Belum Lengkap | Belum Dinilai | Belum Lengkap |

### Step 3: Verify Migration

After migration, verify:

1. **DataAkun Sheet:**
   - [ ] All existing users have Status_Akun = "Active"
   - [ ] All columns A-H are present
   - [ ] No empty cells in critical columns (A, B, C, E)

2. **DataPekerjaan Sheet:**
   - [ ] All existing jobs have Status_Kelengkapan value
   - [ ] Complete jobs have Status_Kelengkapan = "Lengkap"
   - [ ] Incomplete jobs have Status_Kelengkapan = "Belum Lengkap"

3. **Test with API:**
   - [ ] Login with existing user works
   - [ ] Login returns area and statusAkun fields
   - [ ] /api/rekap returns only complete jobs
   - [ ] /api/notifications works correctly

## SQL/Apps Script Alternative

If you have many users, you can use Google Apps Script to automate the migration:

### For DataAkun:

```javascript
function migrateDataAkun() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DataAkun');
  var lastRow = sheet.getLastRow();
  
  // Add headers if not present
  sheet.getRange('D1').setValue('Area');
  sheet.getRange('E1').setValue('Status_Akun');
  sheet.getRange('F1').setValue('Tanggal_Registrasi');
  sheet.getRange('G1').setValue('Approved_By');
  sheet.getRange('H1').setValue('Tanggal_Approval');
  
  // Update existing users
  for (var i = 2; i <= lastRow; i++) {
    if (sheet.getRange('E' + i).getValue() === '') {
      sheet.getRange('E' + i).setValue('Active'); // Set status to Active
      sheet.getRange('F' + i).setValue(new Date().toLocaleString('id-ID')); // Set registration date
      sheet.getRange('G' + i).setValue('System Migration'); // Set approved by
      sheet.getRange('H' + i).setValue(new Date().toLocaleString('id-ID')); // Set approval date
    }
  }
  
  Logger.log('Migration complete. Updated ' + (lastRow - 1) + ' users.');
}
```

### For DataPekerjaan:

```javascript
function migrateDataPekerjaan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DataPekerjaan');
  var lastRow = sheet.getLastRow();
  
  // Add header if not present
  sheet.getRange('O1').setValue('Status_Kelengkapan');
  
  // Update existing jobs
  for (var i = 2; i <= lastRow; i++) {
    var statusDoc = sheet.getRange('M' + i).getValue();
    var statusRisk = sheet.getRange('N' + i).getValue();
    
    if (statusDoc === 'Dokumen Tersimpan' && statusRisk === 'Sudah Dinilai') {
      sheet.getRange('O' + i).setValue('Lengkap');
    } else {
      sheet.getRange('O' + i).setValue('Belum Lengkap');
    }
  }
  
  Logger.log('Migration complete. Updated ' + (lastRow - 1) + ' jobs.');
}
```

To run these scripts:
1. Open your Google Spreadsheet
2. Go to Extensions → Apps Script
3. Copy and paste the scripts
4. Save the project
5. Run `migrateDataAkun()` and `migrateDataPekerjaan()`
6. Check the execution log for confirmation

## Post-Migration Testing

After migration, test these scenarios:

1. **Login with migrated user:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "admin123"}'
   ```
   
   Should return with area and statusAkun fields.

2. **Get recap (should show only complete jobs):**
   ```bash
   curl http://localhost:5000/api/rekap
   ```
   
   Should only return jobs with Status_Kelengkapan = "Lengkap".

3. **Filter recap by area:**
   ```bash
   curl "http://localhost:5000/api/rekap?area=Area%20A"
   ```
   
   Should only return complete jobs in Area A.

## Rollback Plan

If something goes wrong:

1. **Restore from backup:**
   - Go to your backup spreadsheet
   - File → Make a copy
   - Update your SPREADSHEET_ID in .env

2. **Manual rollback:**
   - Delete columns D-H from DataAkun
   - Delete column O from DataPekerjaan
   - Revert to the previous version of server.js

## Common Migration Issues

### Issue: "Status_Akun != Active" error on login
**Solution:** Ensure all existing users have Status_Akun = "Active" in column E

### Issue: Rekap returns empty array
**Solution:** 
1. Check that complete jobs have Status_Kelengkapan = "Lengkap"
2. Verify the migration script ran successfully

### Issue: New registrations not appearing in pending list
**Solution:** 
1. Verify the register endpoint is using range A:H
2. Check that new users have Status_Akun = "Pending"

## Support

If you encounter issues during migration:
1. Check the server logs for errors
2. Verify spreadsheet permissions
3. Ensure service account has editor access
4. Review the API_DOCUMENTATION.md for endpoint specifications
