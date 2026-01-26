require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const cors = require('cors');
const multer = require('multer');
const stream = require('stream');
const { format } = require('date-fns');


const app = express();
// --- TAMBAHAN DEBUGGING (Letakkan disini) ---
try {
    const keyPath = process.env.GOOGLE_KEY_FILE;
    const creds = require(keyPath);
    console.log("========================================");
    console.log("SERVER BERJALAN SEBAGAI:");
    console.log("Email:", creds.client_email);
    console.log("Project ID:", creds.project_id);
    console.log("Target Folder ID:", '186-mtpSHf_vAMzsdhRVOnO7u4qldCqJL'); // Sesuai hardcode Anda
    console.log("========================================");
} catch (e) {
    console.error("GAGAL MEMBACA FILE KUNCI:", e.message);
}
// ---------------------------------------------
const upload = multer({ storage: multer.memoryStorage() }); // Simpan file di RAM sementara

app.use(cors()); // Agar bisa diakses dari Vercel
app.use(express.json());

// --- KONFIGURASI GOOGLE ---
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_KEY_FILE,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ],
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let DRIVE_FOLDER_ID = null; // Akan di-set saat server start

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzTu2gysoQqx7PQ6bK-ccfVPSQMy54VZbILhmSYdbbaZBvDYjJTp-oIRjdSt3faHW46ZA/exec";

// --- HELPER: Get or Create Upload Folder ---
async function getOrCreateUploadFolder() {
    const FOLDER_NAME = 'SimOps_Uploads';

    try {
        // Cari folder yang sudah ada
        const searchRes = await drive.files.list({
            q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id,name)',
            spaces: 'drive',
        });

        if (searchRes.data.files && searchRes.data.files.length > 0) {
            console.log('Folder ditemukan:', searchRes.data.files[0].id);
            return searchRes.data.files[0].id;
        }

        // Buat folder baru jika belum ada
        const createRes = await drive.files.create({
            requestBody: {
                name: FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder',
            },
            fields: 'id',
        });

        const folderId = createRes.data.id;
        console.log('Folder baru dibuat:', folderId);

        // Set permission agar folder bisa diakses siapa saja (untuk view)
        await drive.permissions.create({
            fileId: folderId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // Share ke email admin agar bisa lihat di drive.google.com
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'copilotsimops@gmail.com';
        await drive.permissions.create({
            fileId: folderId,
            requestBody: {
                role: 'writer',
                type: 'user',
                emailAddress: ADMIN_EMAIL,
            },
            sendNotificationEmail: false,
        });
        console.log('Folder di-share ke:', ADMIN_EMAIL);

        return folderId;
    } catch (error) {
        console.error('Error get/create folder:', error.message);
        throw error;
    }
}

// Initialize folder on startup
(async () => {
    try {
        DRIVE_FOLDER_ID = await getOrCreateUploadFolder();
        console.log('Upload folder ready:', DRIVE_FOLDER_ID);
    } catch (e) {
        console.error('GAGAL INIT FOLDER:', e.message);
    }
})();

// --- HELPER FUNCTION: FORMAT TANGGAL ---
const getTimestamp = () => format(new Date(), 'dd/MM/yyyy HH:mm:ss');
const getDateStr = () => format(new Date(), 'dd/MM/yyyy');

// ==========================================
// 1. USER MANAGEMENT (Login & Register)
// ==========================================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:H',
        });

        const rows = response.data.values || [];
        const user = rows.find(row => row[0] === username && row[1] === password);

        if (user) {
            // Check if account is active (index 4 = column E)
            const statusAkun = user[4] || 'Active'; // Default to Active for backward compatibility
            if (statusAkun !== 'Active') {
                return res.status(403).json({
                    status: 'Gagal',
                    message: statusAkun === 'Pending'
                        ? 'Akun Anda masih menunggu persetujuan admin'
                        : 'Akun Anda ditolak oleh admin'
                });
            }

            res.json({
                status: 'Sukses',
                role: user[2],
                username: user[0],
                area: user[3] || '',
                unit: user[4] || '',
                statusAkun: statusAkun
            });
        } else {
            res.status(401).json({ status: 'Gagal', message: 'Username/Password salah' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { regUser, regPass, regRole, area, unit } = req.body;

        // Cek username ada atau tidak
        const check = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:A',
        });

        const existingUsers = check.data.values ? check.data.values.flat() : [];
        if (existingUsers.includes(regUser)) {
            return res.status(400).json({ message: 'Username sudah ada!' });
        }

        // Set default values for new registration
        const statusAkun = 'Pending'; // Default status for new registration
        const tanggalRegistrasi = getTimestamp();
        const approvedBy = ''; // Empty until approved
        const tanggalApproval = ''; // Empty until approved

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    regUser,
                    regPass,
                    regRole,
                    area || '',
                    unit || '',
                    statusAkun,
                    tanggalRegistrasi,
                    approvedBy,
                    tanggalApproval
                ]]
            }
        });

        res.json({
            message: 'Registrasi berhasil! Menunggu persetujuan admin.',
            status: statusAkun
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. DATA PEKERJAAN (Input Job)
// ==========================================

app.post('/api/jobs', async (req, res) => {
    try {
        const form = req.body;
        const idUnik = "JOB-" + format(new Date(), "yyyyMMddHHmmss");
        const timestamp = getTimestamp();

        // Format tanggal kerja agar konsisten
        let tglKerja = form.tanggalKerja;
        if (tglKerja) tglKerja = format(new Date(tglKerja), 'dd/MM/yyyy');

        const values = [
            idUnik, timestamp, form.namaPT, form.kompartemen, form.unit,
            form.jenisPekerjaan, form.namaPekerjaan, form.area, form.pjNama,
            tglKerja, form.jamMulai, form.jamSelesai,
            "Belum Lengkap", "Belum Dinilai", "Belum Lengkap" // Added Status_Kelengkapan
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataPekerjaan!A:O',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [values] }
        });

        res.json({ id: idUnik, message: 'Data pekerjaan tersimpan' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 3. UPLOAD FILE (Ke Drive & Sheet)
// ==========================================

// Endpoint untuk test akses folder
app.get('/api/test-drive', async (req, res) => {
    try {
        // Pastikan folder sudah di-init
        if (!DRIVE_FOLDER_ID) {
            DRIVE_FOLDER_ID = await getOrCreateUploadFolder();
        }

        // List isi folder
        const filesList = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id,name,webViewLink)',
            spaces: 'drive',
        });

        res.json({
            status: 'OK',
            folderId: DRIVE_FOLDER_ID,
            folderUrl: `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`,
            files: filesList.data.files
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { idPekerjaan, jenisDokumen } = req.body;
        const file = req.file;

        if (!file) return res.status(400).send('No file uploaded.');

        // 1. Konversi Buffer File ke Base64 (agar bisa dikirim via JSON ke GAS)
        const base64File = file.buffer.toString('base64');
        const mimeType = file.mimetype;
        const dataURI = `data:${mimeType};base64,${base64File}`;

        // 2. Kirim ke Google Apps Script via HTTP Request
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            redirect: 'follow', // Penting! GAS sering redirect
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS butuh text/plain untuk doPost JSON
            body: JSON.stringify({
                action: 'upload',
                idPekerjaan: idPekerjaan,
                jenisDokumen: jenisDokumen,
                namaFile: file.originalname || `${idPekerjaan}_${jenisDokumen}`,
                fileData: dataURI // Kirim data file base64
            })
        });

        const result = await response.json();

        // 3. Cek respon dari GAS
        if (result.status === 'Sukses') {
            // Check and update Status_Kelengkapan after successful upload
            // The GAS script should already update Status_Dokumen, so we check completion here
            await checkAndUpdateKelengkapan(idPekerjaan);

            res.json({ message: 'Berhasil upload via GAS', url: result.message });
        } else {
            throw new Error(result.message || 'Gagal upload ke GAS');
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 4. DATA RISIKO (Input Risk)
// ==========================================

app.post('/api/risks', async (req, res) => {
    try {
        const { idPekerjaan, dataRisiko } = req.body; // dataRisiko adalah Array of Objects

        const rowsToAdd = dataRisiko.map(r => [
            idPekerjaan, r.aktivitas, r.bahaya, r.l, r.c, r.rr
        ]);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataRisiko!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: rowsToAdd }
        });

        // Update Status di Sheet DataPekerjaan (Kolom N / Index 13)
        await updateStatusPekerjaan(idPekerjaan, 13, "Sudah Dinilai");

        // Check and update Status_Kelengkapan
        await checkAndUpdateKelengkapan(idPekerjaan);

        res.json({ message: 'Risiko Tersimpan' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 5. HELPER & ADMIN (Update Status & Approve)
// ==========================================

// Fungsi Helper untuk Update Cell berdasarkan ID (mirip loop di GAS)
async function updateStatusPekerjaan(id, colIndex, val) {
    // Ambil semua ID (Kolom A)
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'DataPekerjaan!A:A',
    });

    const rows = res.data.values;
    let rowIndex = -1;

    // Cari baris (index mulai dari 0 di array, tapi di sheet mulai dari 1)
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === id) {
            rowIndex = i + 1; // Konversi ke nomor baris Sheet (1-based)
            break;
        }
    }

    if (rowIndex !== -1) {
        // Konversi index kolom (0 = A, 12 = M, 13 = N) ke Huruf Column
        const colLetter = String.fromCharCode(65 + colIndex); // A ASCII 65
        const range = `DataPekerjaan!${colLetter}${rowIndex}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[val]] }
        });
    }
}

// Helper function to check and update Status_Kelengkapan
async function checkAndUpdateKelengkapan(idPekerjaan) {
    try {
        // Get the job data
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataPekerjaan!A:O',
        });

        const rows = res.data.values;
        let rowIndex = -1;
        let job = null;

        // Find the job
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === idPekerjaan) {
                rowIndex = i + 1;
                job = rows[i];
                break;
            }
        }

        if (job && rowIndex !== -1) {
            const statusDokumen = job[12] || '';
            const statusRisiko = job[13] || '';

            // Check if both are complete
            if (statusDokumen === 'Dokumen Terupload' && statusRisiko === 'Sudah Dinilai') {
                // Update Status_Kelengkapan (column O = index 14)
                await updateStatusPekerjaan(idPekerjaan, 14, 'Lengkap');
            }
        }
    } catch (error) {
        console.error('Error updating kelengkapan:', error);
    }
}

// Endpoint Approve (Admin/Inspector)
app.put('/api/jobs/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        await updateStatusPekerjaan(id, 12, "APPROVED");
        res.json({ message: "Dokumen Disetujui Inspector" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 6. GET DATA REKAP (Logic Kompleks `getRekapData`)
// ==========================================

app.get('/api/rekap', async (req, res) => {
    try {
        const { area } = req.query;

        // Ambil Data Secara Paralel agar Cepat
        const [resJobs, resRisks, resDocs] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DataPekerjaan!A2:O' }),
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DataRisiko!A2:F' }),
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DokumenIzin!A2:D' })
        ]);

        const jobs = resJobs.data.values || [];
        const risks = resRisks.data.values || [];
        const docs = resDocs.data.values || [];

        // Mapping Data Risiko
        const jobRiskMap = {};
        risks.forEach(r => {
            const id = r[0];
            if (!id) return;
            // Parse L dan C (handle format "1 - Sangat Jarang" jadi ambil angka 1 saja)
            const l = parseInt(String(r[3] || '0').split('-')[0]) || 0;
            const c = parseInt(String(r[4] || '0').split('-')[0]) || 0;

            if (!jobRiskMap[id]) jobRiskMap[id] = { maxL: 0, maxC: 0, details: [] };
            if (l > jobRiskMap[id].maxL) jobRiskMap[id].maxL = l;
            if (c > jobRiskMap[id].maxC) jobRiskMap[id].maxC = c;

            jobRiskMap[id].details.push({ act: r[1], hazard: r[2], l, c, rr: r[5] });
        });

        // Mapping Data Dokumen
        const jobDocMap = {};
        docs.forEach(d => {
            const id = d[0];
            if (!id || id === 'ID_Ref') return;
            if (!jobDocMap[id]) jobDocMap[id] = [];
            jobDocMap[id].push({ jenis: d[1], url: d[2], waktu: d[3] });
        });

        // Mapping Data Final (Gabung semua)
        const result = jobs.map(row => {
            if (!row[0]) return null;
            const id = row[0];
            const jobArea = row[7] || '';
            const statusKelengkapan = row[14] || 'Belum Lengkap';

            // Filter by Status_Kelengkapan = "Lengkap"
            if (statusKelengkapan !== 'Lengkap') return null;

            // Filter by area if parameter is provided
            if (area && jobArea !== area) return null;

            const riskInfo = jobRiskMap[id] || { maxL: 0, maxC: 0, details: [] };

            return {
                id: id,
                namaPT: row[2],
                kompartemen: row[3],
                unit: row[4],
                jenis: row[5],
                pekerjaan: row[6],
                area: jobArea,
                pj: row[8],
                tanggal: row[9],
                jamMulai: row[10], // Pastikan format HH:mm di sheet
                jamSelesai: row[11],
                statusDoc: row[12] || "Belum Lengkap",
                statusRisk: row[13] || "Belum Dinilai",
                statusKelengkapan: statusKelengkapan,
                riskData: riskInfo,
                docs: jobDocMap[id] || []
            };
        }).filter(item => item !== null);

        res.json(result);

    } catch (error) {
        console.error("Error getRekap:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 7. SIMPAN SIMOPS (Optional)
// ==========================================
app.post('/api/simops', async (req, res) => {
    try {
        const data = req.body;
        const idSimops = "SIM-" + format(new Date(), "ddMMHHmm");

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A:H',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    idSimops,
                    getDateStr(),
                    data.area,
                    data.konflikJobs,
                    "Mitigasi Tambahan",
                    JSON.stringify(data.apdTambahan),
                    JSON.stringify(data.gabunganRisk),
                    new Date().toISOString()
                ]]
            }
        });
        res.json({ message: "SIMOPS Recorded" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 8. NEW ENDPOINTS - Feature 1: Notifications
// ==========================================

// Get notifications for today's incomplete jobs
app.get('/api/notifications', async (req, res) => {
    try {
        const todayDate = getDateStr(); // Format: dd/MM/yyyy

        // Get all jobs
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataPekerjaan!A2:O',
        });

        const jobs = response.data.values || [];

        // Filter jobs for today that are incomplete
        const notifications = jobs
            .filter(row => {
                if (!row[0]) return false;
                const tanggalKerja = row[9] || ''; // Column J (index 9)
                const statusDokumen = row[12] || ''; // Column M (index 12)
                const statusRisiko = row[13] || ''; // Column N (index 13)

                // Check if job is for today and incomplete
                return (
                    tanggalKerja === todayDate &&
                    (statusDokumen !== 'Dokumen Tersimpan' || statusRisiko !== 'Sudah Dinilai')
                );
            })
            .map(row => ({
                id: row[0],
                namaPT: row[2],
                jenisPekerjaan: row[5],
                namaPekerjaan: row[6],
                area: row[7],
                pj: row[8],
                tanggal: row[9],
                jamMulai: row[10],
                jamSelesai: row[11],
                statusDoc: row[12] || 'Belum Lengkap',
                statusRisk: row[13] || 'Belum Dinilai',
                message: row[12] !== 'Dokumen Tersimpan'
                    ? 'Dokumen belum lengkap'
                    : 'Penilaian risiko belum selesai'
            }));

        res.json({
            date: todayDate,
            count: notifications.length,
            notifications: notifications
        });
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 9. NEW ENDPOINTS - Feature 3: Incomplete Jobs
// ==========================================

// Get incomplete jobs by username
app.get('/api/jobs/incomplete', async (req, res) => {
    try {
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({ error: 'Username parameter required' });
        }

        // Get all jobs
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataPekerjaan!A2:O',
        });

        const jobs = response.data.values || [];

        // Filter incomplete jobs by username (nama petugas/worker in column G, index 6)
        const incompleteJobs = jobs
            .filter(row => {
                if (!row[0]) return false;
                const namaPetugas = row[6] || ''; // Column G (index 6) - Nama_Petugas/Worker Username
                const statusKelengkapan = row[14] || 'Belum Lengkap'; // Column O (index 14)

                return namaPetugas === username && statusKelengkapan !== 'Lengkap';
            })
            .map(row => ({
                id: row[0],
                timestamp: row[1],
                namaPT: row[2],
                kompartemen: row[3],
                unit: row[4],
                jenisPekerjaan: row[5],
                namaPekerjaan: row[6],
                area: row[7],
                pj: row[8],
                tanggal: row[9],
                jamMulai: row[10],
                jamSelesai: row[11],
                statusDoc: row[12] || 'Belum Lengkap',
                statusRisk: row[13] || 'Belum Dinilai',
                statusKelengkapan: row[14] || 'Belum Lengkap'
            }));

        res.json({
            username: username,
            count: incompleteJobs.length,
            jobs: incompleteJobs
        });
    } catch (error) {
        console.error('Error getting incomplete jobs:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 10. NEW ENDPOINTS - Feature 4: User Management
// ==========================================

// Get pending registrations (Admin only)
app.get('/api/users/pending', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:H',
        });

        const users = response.data.values || [];

        // Filter users with Status_Akun = "Pending"
        const pendingUsers = users
            .filter(row => {
                const statusAkun = row[4] || '';
                return statusAkun === 'Pending';
            })
            .map(row => ({
                username: row[0],
                role: row[2],
                area: row[3] || '',
                statusAkun: row[4],
                tanggalRegistrasi: row[5] || ''
            }));

        res.json({
            count: pendingUsers.length,
            users: pendingUsers
        });
    } catch (error) {
        console.error('Error getting pending users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve user registration (Admin only)
app.put('/api/users/:username/approve', async (req, res) => {
    try {
        const { username } = req.params;
        const { adminUsername } = req.body;

        if (!adminUsername) {
            return res.status(400).json({ error: 'Admin username required' });
        }

        // Get all users
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:H',
        });

        const users = response.data.values || [];
        let rowIndex = -1;

        // Find user
        for (let i = 0; i < users.length; i++) {
            if (users[i][0] === username) {
                rowIndex = i + 2; // +2 because we start from A2
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update Status_Akun (column E), Approved_By (column G), and Tanggal_Approval (column H)
        const tanggalApproval = getTimestamp();

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                        range: `DataAkun!E${rowIndex}`,
                        values: [['Active']]
                    },
                    {
                        range: `DataAkun!G${rowIndex}`,
                        values: [[adminUsername]]
                    },
                    {
                        range: `DataAkun!H${rowIndex}`,
                        values: [[tanggalApproval]]
                    }
                ]
            }
        });

        res.json({
            message: 'User approved successfully',
            username: username,
            approvedBy: adminUsername,
            approvedAt: tanggalApproval
        });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject user registration (Admin only)
app.put('/api/users/:username/reject', async (req, res) => {
    try {
        const { username } = req.params;

        // Get all users
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:H',
        });

        const users = response.data.values || [];
        let rowIndex = -1;

        // Find user
        for (let i = 0; i < users.length; i++) {
            if (users[i][0] === username) {
                rowIndex = i + 2; // +2 because we start from A2
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update Status_Akun to "Rejected" (column E)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `DataAkun!E${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Rejected']] }
        });

        res.json({
            message: 'User rejected successfully',
            username: username
        });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server Backend is running on port ${PORT}`);
});