# SimOps Backend

Backend API for the SimOps (Simultaneous Operations) management system. Built with Express.js and integrated with Google Sheets API.

## 🚀 Features

### Core Features
- User authentication and authorization
- Job creation and management
- Document upload to Google Drive
- Risk assessment tracking
- Job recap and reporting

### New Features (v2.0)
1. **Dynamic Notifications** - Real-time notifications for today's incomplete jobs
2. **Area-based Filtering** - Filter jobs by area for staff members
3. **Incomplete Job Persistence** - Auto-save and resume incomplete jobs
4. **User Registration with Approval** - Staff registration requires admin approval

## 📋 Prerequisites

- Node.js (v14 or higher)
- Google Cloud Project with Sheets & Drive API enabled
- Google Service Account with credentials
- Google Spreadsheet with proper schema

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/bagas-sanjaya-UeU/simops-backend.git
cd simops-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
PORT=5000
SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_KEY_FILE=./service-account.json
ADMIN_EMAIL=your_admin_email@gmail.com
```

4. Add your Google Service Account credentials:
Place your `service-account.json` file in the root directory.

5. Update your spreadsheet schema (see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md))

## 🏃 Running the Server

Development mode:
```bash
node server.js
```

The server will start on `http://localhost:5000`

## 📚 Documentation

- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference with request/response examples
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Manual testing procedures and test scenarios
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Guide to update spreadsheet schema
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Overview of recent changes

## 📊 Spreadsheet Schema

### DataAkun Sheet (A:H)
| Column | Field | Type |
|--------|-------|------|
| A | Username | String |
| B | Password | String |
| C | Role | String (Admin/Staff) |
| D | Area | String |
| E | Status_Akun | String (Pending/Active/Rejected) |
| F | Tanggal_Registrasi | Timestamp |
| G | Approved_By | String |
| H | Tanggal_Approval | Timestamp |

### DataPekerjaan Sheet (A:O)
| Column | Field | Type |
|--------|-------|------|
| A | ID_Pekerjaan | String |
| B | Timestamp | Timestamp |
| C | Nama_PT | String |
| D | Kompartemen | String |
| E | Unit | String |
| F | Jenis_Pekerjaan | String |
| G | Nama_Petugas | String |
| H | Area | String |
| I | Nama_PJ | String |
| J | Tanggal_Kerja | Date (dd/MM/yyyy) |
| K | Jam_Mulai | Time (HH:mm) |
| L | Jam_Selesai | Time (HH:mm) |
| M | Status_Dokumen | String |
| N | Status_Risiko | String |
| O | Status_Kelengkapan | String (Belum Lengkap/Lengkap) |

### DataRisiko Sheet (A:F)
| Column | Field | Type |
|--------|-------|------|
| A | ID_Pekerjaan | String |
| B | Aktivitas | String |
| C | Bahaya | String |
| D | L (Likelihood) | Number |
| E | C (Consequence) | Number |
| F | RR (Risk Rating) | Number |

### DokumenIzin Sheet (A:D)
| Column | Field | Type |
|--------|-------|------|
| A | ID_Ref | String |
| B | Jenis_Dokumen | String |
| C | Link_File | URL |
| D | Waktu_Upload | Timestamp |

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration (creates pending account)

### User Management (Admin)
- `GET /api/users/pending` - Get pending registrations
- `PUT /api/users/:username/approve` - Approve user registration
- `PUT /api/users/:username/reject` - Reject user registration

### Jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/incomplete` - Get incomplete jobs by username
- `GET /api/notifications` - Get today's incomplete jobs

### Documents & Risks
- `POST /api/upload` - Upload document
- `POST /api/risks` - Submit risk assessment

### Reports
- `GET /api/rekap` - Get job recap (supports area filtering)

### Other
- `POST /api/simops` - Save SIMOPS record
- `PUT /api/jobs/:id/approve` - Approve job (inspector)
- `GET /api/test-drive` - Test Google Drive access

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed endpoint specifications.

## 🧪 Testing

Quick test with cURL:

```bash
# Test server is running
curl http://localhost:5000/api/test-drive

# Register new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"regUser":"testuser","regPass":"test123","regRole":"Staff","area":"Area A"}'

# Get notifications
curl http://localhost:5000/api/notifications
```

For comprehensive testing, see [TESTING_GUIDE.md](./TESTING_GUIDE.md)

## 🔒 Security

- Uses Google Service Account for authentication
- Environment variables for sensitive data
- Input validation on all endpoints
- Status-based access control for user accounts
- CodeQL security scanning: **0 vulnerabilities**

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js v5.2.1
- **APIs:** Google Sheets API, Google Drive API
- **Authentication:** Google Service Account
- **Date Formatting:** date-fns v4.1.0
- **File Upload:** Multer v2.0.2
- **CORS:** Enabled for cross-origin requests

## 📦 Dependencies

```json
{
  "express": "^5.2.1",
  "googleapis": "^170.1.0",
  "date-fns": "^4.1.0",
  "cors": "^2.8.6",
  "multer": "^2.0.2",
  "node-fetch": "^2.7.0",
  "dotenv": "^17.2.3"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

ISC

## 👥 Authors

- bagas-sanjaya-UeU

## 🐛 Known Issues

1. Upload endpoint depends on external Google Apps Script
2. No pagination on list endpoints (may be slow with large datasets)
3. Admin endpoints don't verify admin role (should be added)

## 🔄 Version History

### v2.0 (Latest)
- Added dynamic notifications for today's jobs
- Implemented area-based filtering
- Added incomplete job persistence
- Implemented user registration with approval workflow
- Updated spreadsheet schema (DataAkun A:H, DataPekerjaan A:O)

### v1.0
- Initial release
- Basic job management
- Document upload
- Risk assessment
- User authentication

## 📞 Support

For issues and questions:
1. Check the documentation files
2. Review the testing guide
3. Check server logs for error details
4. Open an issue on GitHub

## 🚀 Deployment

Before deploying to production:

1. ✅ Update spreadsheet schema (see MIGRATION_GUIDE.md)
2. ✅ Set environment variables
3. ✅ Configure service account permissions
4. ✅ Test all endpoints
5. ✅ Enable HTTPS
6. ✅ Set up monitoring and logging

## 📈 Future Enhancements

- [ ] Add role-based access control
- [ ] Implement pagination
- [ ] Add email notifications
- [ ] Add audit logging
- [ ] Implement rate limiting
- [ ] Add data export functionality
- [ ] Add WebSocket support for real-time updates
