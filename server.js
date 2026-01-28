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
            range: 'DataAkun!A2:I',
        });

        const rows = response.data.values || [];
        const user = rows.find(row => row[0] === username && row[1] === password);

        if (user) {
            // Check if account is active (index 5 = column F)
            const statusAkun = user[5] || 'Active'; // Default to Active for backward compatibility
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

        // Order: ID, Timestamp, Kompartemen, Unit, Nama_PT, Jenis_Pekerjaan, Nama_Pekerjaan, Area, PJ, Tanggal_Kerja, Jam_Mulai, Jam_Selesai, Status_Dokumen, Status_Risiko, Status_Kelengkapan
        const values = [
            idUnik, timestamp, form.kompartemen, form.unit, form.namaPT,
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
        const { area, unit, today, date, onlyComplete } = req.query;
        const todayStr = getDateStr();

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
            const jobArea = (row[7] || '').trim(); // Column H (index 7) = Area
            const jobUnit = (row[3] || '').trim(); // Column D (index 3) = Unit
            const statusKelengkapan = (row[14] || 'Belum Lengkap').trim();
            const tanggalKerja = (row[9] || '').trim();

            // Filter by Status_Kelengkapan only when requested
            const requireComplete = String(onlyComplete || '0') === '1';
            if (requireComplete && statusKelengkapan !== 'Lengkap') return null;

            // Filter by area if parameter is provided
            if (area && jobArea.toLowerCase() !== String(area).trim().toLowerCase()) return null;

            // Filter by unit if parameter is provided
            if (unit && jobUnit.toLowerCase() !== String(unit).trim().toLowerCase()) return null;

            // Filter hanya hari ini jika diminta
            if (today && String(today).trim() !== '' && tanggalKerja !== todayStr) return null;

            // Or filter by a specific date if provided
            if (date && String(date).trim() !== '' && tanggalKerja !== String(date).trim()) return null;

            const riskInfo = jobRiskMap[id] || { maxL: 0, maxC: 0, details: [] };

            return {
                id: id,
                timestamp: row[1],
                kompartemen: row[2],
                unit: row[3],
                namaPT: row[4],
                jenis: row[5],
                pekerjaan: row[6],
                area: jobArea,
                pj: row[8],
                tanggal: tanggalKerja,
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
// 7a. CREATE INITIAL SIMOPS (Saat konflik terdeteksi)
// ==========================================
app.post('/api/simops/init', async (req, res) => {
    try {
        const { idSimops, area, tanggal, konflikJobs, gabunganRisk } = req.body;

        if (!idSimops || !area || !tanggal) {
            return res.status(400).json({ error: 'idSimops, area, and tanggal are required' });
        }

        // Check if this SIMOPS already exists (by area and tanggal)
        const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:C',
        });

        const rows = existing.data.values || [];
        const existingRecord = rows.find(r => r[2] === area && r[1] === tanggal);

        if (existingRecord) {
            // Return existing ID if already exists
            return res.json({
                message: "SIMOPS already exists",
                id: existingRecord[0],
                isNew: false
            });
        }

        const waktuInput = new Date().toISOString();
        const dataRisikoJSON = JSON.stringify(gabunganRisk || {});

        // Insert new record with Keputusan = 'Belum Ditentukan'
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    idSimops,                           // A: ID_Simops
                    tanggal,                            // B: Tanggal
                    area,                               // C: Area
                    konflikJobs || '',                  // D: Konflik_Antara
                    'Belum Ditentukan',                 // E: Keputusan_Pengendalian
                    dataRisikoJSON,                     // F: Data_Risiko_JSON
                    '',                                 // G: Detail_Mitigasi_JSON (kosong dulu)
                    waktuInput,                         // H: Waktu_Input
                    ''                                  // I: RiskResidual
                ]]
            }
        });

        res.json({ message: "SIMOPS Initialized", id: idSimops, isNew: true });
    } catch (error) {
        console.error("Error init simops:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 7b. UPDATE SIMOPS dengan Mitigasi (untuk Ganti Jam / Mitigasi Lainnya)
// ==========================================
app.put('/api/simops/:id/mitigasi', async (req, res) => {
    try {
        const { id } = req.params;
        const { keputusan, detailMitigasi, gabunganRisk } = req.body;

        // Find the SIMOPS record
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:I',
        });

        const rows = response.data.values || [];
        let rowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === id) {
                rowIndex = i + 2;
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'SIMOPS record not found' });
        }

        const dataRisikoJSON = JSON.stringify(gabunganRisk || {});
        const detailMitigasiJSON = JSON.stringify(detailMitigasi || {});

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    { range: `RekapSIMOPS!E${rowIndex}`, values: [[keputusan]] },
                    { range: `RekapSIMOPS!F${rowIndex}`, values: [[dataRisikoJSON]] },
                    { range: `RekapSIMOPS!G${rowIndex}`, values: [[detailMitigasiJSON]] }
                ]
            }
        });

        res.json({ message: 'Mitigasi berhasil disimpan', id: id });
    } catch (error) {
        console.error('Error updating mitigasi:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 7c. SIMPAN SIMOPS (Legacy - untuk backward compatibility)
// ==========================================
app.post('/api/simops', async (req, res) => {
    try {
        const data = req.body;
        // Guna ID dari Frontend jika ada, jika tidak generate di backend
        const idSimops = data.idSimops || ("SIM-" + format(new Date(), "ddMMHHmm"));
        const timestamp = getDateStr();

        // FIX #1: Waktu_Input sekarang menggunakan timestamp yang benar (ISO format)
        const waktuInput = new Date().toISOString();

        // FIX #2: Data_Risiko_JSON sekarang menyimpan maxL, maxC dari gabungan risiko
        // Data ini dikirim dari frontend dengan struktur { maxL, maxC, ... }
        const dataRisikoJSON = JSON.stringify(data.gabunganRisk || {});

        // Detail_Mitigasi_JSON untuk menyimpan detail mitigasi (APD, changes, dll)
        const detailMitigasiJSON = JSON.stringify({
            type: data.gabunganRisk?.type || '',
            apdTambahan: data.apdTambahan || [],
            changes: data.gabunganRisk?.changes || [],
            namaSO: data.gabunganRisk?.namaSO || [],
            namaSI: data.gabunganRisk?.namaSI || [],
            leader: data.gabunganRisk?.leader || '',
            jumlahPekerja: data.gabunganRisk?.jumlahPekerja || 0
        });

        // Urutan Kolom: 
        // A=ID_Simops, B=Tanggal, C=Area, D=Konflik_Antara, E=Keputusan_Pengendalian, 
        // F=Data_Risiko_JSON, G=Detail_Mitigasi_JSON, H=Waktu_Input, I=RiskResidual

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    idSimops,                                           // A: ID_Simops
                    timestamp,                                          // B: Tanggal
                    data.area,                                          // C: Area
                    data.konflikJobs,                                   // D: Konflik_Antara
                    data.gabunganRisk?.type || "Belum Ditentukan",      // E: Keputusan_Pengendalian
                    dataRisikoJSON,                                     // F: Data_Risiko_JSON (maxL, maxC)
                    detailMitigasiJSON,                                 // G: Detail_Mitigasi_JSON
                    waktuInput,                                         // H: Waktu_Input (timestamp)
                    ""                                                  // I: RiskResidual (kosong dulu)
                ]]
            }
        });
        res.json({ message: "SIMOPS Recorded", id: idSimops });
    } catch (error) {
        console.error("Error save simops:", error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/simops/residual', async (req, res) => {
    try {
        const { simopsId, l, c, rr } = req.body;

        if (!simopsId) return res.status(400).json({ error: 'ID Simops required' });

        // Cari Baris berdasarkan ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:A', // Ambil kolom ID saja
        });

        const rows = response.data.values || [];
        let rowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === simopsId) {
                rowIndex = i + 2; // +2 karena mulai dari A2
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'Data SIMOPS tidak ditemukan' });
        }

        // Format Data Residual JSON
        const residualData = JSON.stringify({
            maxL: parseInt(l),
            maxC: parseInt(c),
            rr: parseInt(rr),
            updatedAt: new Date().toISOString()
        });

        // Update Kolom I (Index 8) pada baris yang ditemukan
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `RekapSIMOPS!I${rowIndex}`, // Kolom I untuk Residual
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[residualData]]
            }
        });

        res.json({ message: "Risiko Residual Disimpan" });

    } catch (error) {
        console.error("Error save residual:", error);
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
                kompartemen: row[2],
                unit: row[3],
                namaPT: row[4],
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
                kompartemen: row[2],
                unit: row[3],
                namaPT: row[4],
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
            range: 'DataAkun!A2:I',
        });

        const users = response.data.values || [];

        // Filter users with Status_Akun = "Pending"
        const pendingUsers = users
            .filter(row => {
                const statusAkun = row[5] || '';
                return statusAkun === 'Pending';
            })
            .map(row => ({
                username: row[0],
                role: row[2],
                area: row[3] || '',
                unit: row[4] || '',
                statusAkun: row[5],
                tanggalRegistrasi: row[6] || ''
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
        // Fix: Make adminUsername optional, use 'Admin' as default
        const adminUsername = req.body?.adminUsername || 'Admin';

        // Get all users
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataAkun!A2:I',
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

        // Update Status_Akun (column F), Approved_By (column H), and Tanggal_Approval (column I)
        const tanggalApproval = getTimestamp();

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                        range: `DataAkun!F${rowIndex}`,
                        values: [['Active']]
                    },
                    {
                        range: `DataAkun!H${rowIndex}`,
                        values: [[adminUsername]]
                    },
                    {
                        range: `DataAkun!I${rowIndex}`,
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
            range: 'DataAkun!A2:I',
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

        // Update Status_Akun to "Rejected" (column F)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `DataAkun!F${rowIndex}`,
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

// ==========================================
// 11. NEW ENDPOINTS - Feature 2: SIMOPS Risk Control (UPDATED)
// ==========================================

// Get conflicts - detect jobs with overlapping time and same area
app.get('/api/simops/conflicts', async (req, res) => {
    try {
        const { date, area } = req.query;

        if (!date || !area) {
            return res.status(400).json({ error: 'Date and area parameters required' });
        }

        // Get all jobs
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DataPekerjaan!A2:O',
        });

        const jobs = response.data.values || [];

        // Filter jobs by date and area
        const filteredJobs = jobs
            .filter(row => {
                if (!row[0]) return false;
                const tanggalKerja = row[9] || ''; // Column J (index 9)
                const jobArea = row[7] || ''; // Column H (index 7)
                return tanggalKerja === date && jobArea === area;
            })
            .map(row => ({
                id: row[0],
                namaPT: row[4] || '', // Column E (index 4)
                area: row[7] || '', // Column H (index 7)
                jamMulai: row[10] || '', // Column K (index 10)
                jamSelesai: row[11] || '' // Column L (index 11)
            }));

        // Group jobs by EXACT same time slots (jamMulai & jamSelesai)
        const slotMap = new Map();
        for (const job of filteredJobs) {
            const key = `${date}|${area}|${job.jamMulai}|${job.jamSelesai}`;
            if (!slotMap.has(key)) slotMap.set(key, []);
            slotMap.get(key).push(job);
        }

        const conflicts = [];
        for (const [key, jobsInSlot] of slotMap.entries()) {
            if (jobsInSlot.length >= 2) {
                const [, , jm, js] = key.split('|');
                conflicts.push({
                    timeSlot: `${jm}-${js}`,
                    jobs: jobsInSlot
                });
            }
        }

        res.json({
            date: date,
            area: area,
            conflicts: conflicts
        });
    } catch (error) {
        console.error('Error getting conflicts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save time change mitigation (UPDATED - Fix Waktu_Input)
app.post('/api/simops/mitigasi-ganti-jam', async (req, res) => {
    try {
        const { simopsId, area, changes } = req.body;

        if (!simopsId || !area || !changes || !Array.isArray(changes)) {
            return res.status(400).json({ error: 'simopsId, area, and changes array required' });
        }

        // Find the SIMOPS record
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:I',
        });

        const rows = response.data.values || [];
        let rowIndex = -1;

        // Find the row with matching simopsId
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === simopsId) {
                rowIndex = i + 2; // +2 because we start from A2
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'SIMOPS record not found' });
        }

        // FIX: Update Detail_Mitigasi_JSON dengan data changes (bukan Waktu_Input)
        // Get existing Detail_Mitigasi_JSON and merge with changes
        const existingData = rows[rowIndex - 2][6] ? JSON.parse(rows[rowIndex - 2][6]) : {};
        const updatedMitigasiData = {
            ...existingData,
            type: 'Ganti Jam',
            changes: changes
        };

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                        range: `RekapSIMOPS!E${rowIndex}`, // Column E = Keputusan_Pengendalian
                        values: [['Ganti Jam']]
                    },
                    {
                        range: `RekapSIMOPS!G${rowIndex}`, // Column G = Detail_Mitigasi_JSON
                        values: [[JSON.stringify(updatedMitigasiData)]]
                    }
                    // Note: Waktu_Input (Column H) sudah di-set saat /api/simops dipanggil
                ]
            }
        });

        // Optionally update DataPekerjaan with new times
        for (const change of changes) {
            const { jobId, jamMulai, jamSelesai } = change;

            // Find job row
            const jobsResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'DataPekerjaan!A2:O',
            });

            const jobRows = jobsResponse.data.values || [];
            let jobRowIndex = -1;

            for (let i = 0; i < jobRows.length; i++) {
                if (jobRows[i][0] === jobId) {
                    jobRowIndex = i + 2;
                    break;
                }
            }

            if (jobRowIndex !== -1) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: [
                            {
                                range: `DataPekerjaan!K${jobRowIndex}`, // Column K = Jam_Mulai
                                values: [[jamMulai]]
                            },
                            {
                                range: `DataPekerjaan!L${jobRowIndex}`, // Column L = Jam_Selesai
                                values: [[jamSelesai]]
                            }
                        ]
                    }
                });
            }
        }

        res.json({
            message: 'Mitigasi ganti jam berhasil disimpan',
            simopsId: simopsId,
            changes: changes
        });
    } catch (error) {
        console.error('Error saving time change mitigation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save other mitigation (UPDATED - Fix Waktu_Input)
app.post('/api/simops/mitigasi-lainnya', async (req, res) => {
    try {
        const { simopsId, area, namaSO, namaSI, leader, jumlahPekerja } = req.body;

        if (!simopsId || !area) {
            return res.status(400).json({ error: 'simopsId and area required' });
        }

        // Find the SIMOPS record
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:I',
        });

        const rows = response.data.values || [];
        let rowIndex = -1;

        // Find the row with matching simopsId
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === simopsId) {
                rowIndex = i + 2; // +2 because we start from A2
                break;
            }
        }

        if (rowIndex === -1) {
            return res.status(404).json({ error: 'SIMOPS record not found' });
        }

        // Prepare mitigation data
        const mitigationData = {
            type: 'Mitigasi Tambahan',
            namaSO: namaSO || [],
            namaSI: namaSI || [],
            leader: leader || '',
            jumlahPekerja: jumlahPekerja || 0
        };

        const detailMitigasiJSON = JSON.stringify(mitigationData);

        // Update RekapSIMOPS - Keputusan dan Detail_Mitigasi saja
        // Waktu_Input sudah di-set saat /api/simops dipanggil
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    {
                        range: `RekapSIMOPS!E${rowIndex}`, // Column E = Keputusan_Pengendalian
                        values: [['Mitigasi Tambahan']]
                    },
                    {
                        range: `RekapSIMOPS!G${rowIndex}`, // Column G = Detail_Mitigasi_JSON
                        values: [[detailMitigasiJSON]]
                    }
                ]
            }
        });

        res.json({
            message: 'Mitigasi lainnya berhasil disimpan',
            simopsId: simopsId,
            data: mitigationData
        });
    } catch (error) {
        console.error('Error saving other mitigation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get SIMOPS recap data (UPDATED - Include keputusanPengendalian check)
app.get('/api/simops/rekap', async (req, res) => {
    try {
        const { simopsId } = req.query;
        // Ambil range A sampai I
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'RekapSIMOPS!A2:I',
        });

        const rows = response.data.values || [];

        let rekapData = rows
            .filter(row => row[0])
            .map(row => {
                let dataRisiko = {};      // Dari Kolom F (Data_Risiko_JSON)
                let detailMitigasi = {};  // Dari Kolom G (Detail_Mitigasi_JSON)
                let dataResidual = null;  // Dari Kolom I (RiskResidual)

                try { if (row[5]) dataRisiko = JSON.parse(row[5]); } catch (e) { }
                try { if (row[6]) detailMitigasi = JSON.parse(row[6]); } catch (e) { }
                try { if (row[8]) dataResidual = JSON.parse(row[8]); } catch (e) { }

                // Hitung status pengendalian berdasarkan RR residual vs RR gabungan
                let combinedRR = 0;
                if (typeof dataRisiko?.rr === 'number') combinedRR = dataRisiko.rr;
                else if (typeof dataRisiko?.combinedRR === 'number') combinedRR = dataRisiko.combinedRR;
                else if (typeof dataRisiko?.maxL === 'number' && typeof dataRisiko?.maxC === 'number') combinedRR = dataRisiko.maxL * dataRisiko.maxC;
                const residualRR = (dataResidual && typeof dataResidual.rr === 'number') ? dataResidual.rr : null;
                const statusPengendalian = (residualRR !== null)
                    ? ((residualRR < combinedRR) ? 'SIMOPS Terkendali' : 'Belum Terkendali')
                    : '';

                return {
                    idSimops: row[0],                              // A
                    tanggal: row[1],                               // B
                    area: row[2],                                  // C
                    konflikAntara: row[3],                         // D
                    keputusan: row[4] || '',                       // E (Keputusan_Pengendalian)
                    keputusanPengendalian: row[4] || '',           // E (alias untuk compatibility)
                    dataRisiko: dataRisiko,                        // F
                    detailMitigasi: detailMitigasi,                // G
                    waktuInput: row[7] || '',                      // H
                    dataResidual: dataResidual,                    // I
                    statusPengendalian: statusPengendalian,
                    combinedRR: combinedRR
                };
            });

        if (simopsId) {
            rekapData = rekapData.filter(item => item.idSimops === simopsId);
        }

        res.json({ count: rekapData.length, data: rekapData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server Backend is running on port ${PORT}`);
});
