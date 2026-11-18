/**
 * Google Drive Service — رفع الملفات إلى Google Drive
 * يستخدم OAuth2 مع Refresh Token (بدون مكتبة googleapis)
 * الملفات تُرفع إلى فولدر مخصص على Drive الخاص بالمالك
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const config = require('../config');

// ─── مسار حفظ Refresh Token ──────────────────────────────────────────────────
const TOKEN_FILE = path.join(__dirname, '../../.drive-token.json');

// ─── قراءة/كتابة التوكن ──────────────────────────────────────────────────────
function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); }
  catch { return null; }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// ─── طلب HTTP بسيط ───────────────────────────────────────────────────────────
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, data: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── تجديد Access Token ───────────────────────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id:     config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  }).toString();

  const res = await httpRequest({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);

  if (res.status !== 200 || !res.data.access_token) {
    throw new Error('فشل تجديد Access Token: ' + JSON.stringify(res.data));
  }
  return res.data.access_token;
}

// ─── الحصول على Access Token صالح ────────────────────────────────────────────
async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('لم يتم ربط Google Drive بعد — قم بتشغيل /api/admin/drive/auth أولاً');
  }
  return await refreshAccessToken(tokens.refresh_token);
}

// ─── إنشاء أو جلب فولدر على Drive ───────────────────────────────────────────
async function getOrCreateFolder(accessToken, name, parentId) {
  // ابحث أولاً
  const q = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : '')
  );
  const search = await httpRequest({
    hostname: 'www.googleapis.com',
    path:     `/drive/v3/files?q=${q}&fields=files(id,name)`,
    method:   'GET',
    headers:  { Authorization: `Bearer ${accessToken}` },
  });

  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id;
  }

  // أنشئ فولدر جديد
  const meta = JSON.stringify({
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {}),
  });
  const create = await httpRequest({
    hostname: 'www.googleapis.com',
    path:     '/drive/v3/files?fields=id',
    method:   'POST',
    headers:  { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(meta) },
  }, meta);

  return create.data.id;
}

// ─── رفع ملف إلى Drive (Multipart Upload) ────────────────────────────────────
async function uploadToDrive(buffer, filename, mimeType, folderId) {
  const accessToken = await getAccessToken();

  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
  });

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = Buffer.from(
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    metadata
  );
  const filePart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const body = Buffer.concat([metaPart, filePart, buffer, Buffer.from(closeDelimiter)]);

  const res = await httpRequest({
    hostname: 'www.googleapis.com',
    path:     '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
    method:   'POST',
    headers:  {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
      'Content-Length': body.length,
    },
  }, body);

  if (res.status !== 200 || !res.data.id) {
    throw new Error('فشل رفع الملف: ' + JSON.stringify(res.data));
  }

  // اجعل الملف عاماً (للقراءة)
  await httpRequest({
    hostname: 'www.googleapis.com',
    path:     `/drive/v3/files/${res.data.id}/permissions`,
    method:   'POST',
    headers:  { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': 50 },
  }, JSON.stringify({ role: 'reader', type: 'anyone' }));

  // رابط مباشر للعرض
  const directUrl = `https://drive.google.com/uc?id=${res.data.id}&export=view`;
  return { fileId: res.data.id, url: directUrl };
}

// ─── حذف ملف من Drive ────────────────────────────────────────────────────────
async function deleteFromDrive(fileId) {
  if (!fileId) return;
  try {
    const accessToken = await getAccessToken();
    await httpRequest({
      hostname: 'www.googleapis.com',
      path:     `/drive/v3/files/${fileId}`,
      method:   'DELETE',
      headers:  { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    console.error('خطأ في حذف ملف Drive:', e.message);
  }
}

// ─── الواجهة الرئيسية: رفع ملف حسب النوع ─────────────────────────────────────
let _rootFolderId   = null;
let _imageFolderId  = null;
let _videoFolderId  = null;
let _audioFolderId  = null;

async function getFolders() {
  const accessToken = await getAccessToken();
  if (!_rootFolderId) {
    _rootFolderId  = await getOrCreateFolder(accessToken, 'بيرمي — Code Platform');
    _imageFolderId = await getOrCreateFolder(accessToken, 'images',  _rootFolderId);
    _videoFolderId = await getOrCreateFolder(accessToken, 'videos',  _rootFolderId);
    _audioFolderId = await getOrCreateFolder(accessToken, 'audio',   _rootFolderId);
  }
  return { imageFolderId: _imageFolderId, videoFolderId: _videoFolderId, audioFolderId: _audioFolderId };
}

async function uploadImage(buffer, filename) {
  const { imageFolderId } = await getFolders();
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }[ext] || 'image/jpeg';
  return uploadToDrive(buffer, filename, mime, imageFolderId);
}

async function uploadVideo(buffer, filename) {
  const { videoFolderId } = await getFolders();
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = ext === 'webm' ? 'video/webm' : 'video/mp4';
  return uploadToDrive(buffer, filename, mime, videoFolderId);
}

async function uploadAudio(buffer, filename) {
  const { audioFolderId } = await getFolders();
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = { ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' }[ext] || 'audio/mpeg';
  return uploadToDrive(buffer, filename, mime, audioFolderId);
}

// ─── توليد رابط المصادقة (يُستخدم مرة واحدة فقط) ────────────────────────────
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id:    config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type:'code',
    scope:        'https://www.googleapis.com/auth/drive.file',
    access_type:  'offline',
    prompt:       'consent',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params}`;
}

// ─── استبدال Authorization Code بـ Refresh Token ─────────────────────────────
async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id:     config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri:  config.googleRedirectUri,
    grant_type:    'authorization_code',
  }).toString();

  const res = await httpRequest({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);

  if (!res.data.refresh_token) throw new Error('لم يُرجع Google Refresh Token — تأكد أن access_type=offline');
  saveTokens({ refresh_token: res.data.refresh_token, access_token: res.data.access_token });
  return res.data;
}

// ─── هل Drive مربوط؟ ─────────────────────────────────────────────────────────
function isDriveConnected() {
  const t = loadTokens();
  return !!(t && t.refresh_token);
}

module.exports = { uploadImage, uploadVideo, uploadAudio, deleteFromDrive, getAuthUrl, exchangeCode, isDriveConnected };
