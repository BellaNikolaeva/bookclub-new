const express = require('express');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Firebase Admin SDK
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// API: получить все встречи
app.get('/api/meetings', async (req, res) => {
  const snapshot = await db.collection('meetings').get();
  const meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(meetings);
});

// API: записаться на встречу
app.post('/api/meetings/:id/signup', async (req, res) => {
  const { name } = req.body;
  const meetingRef = db.collection('meetings').doc(req.params.id);
  const doc = await meetingRef.get();
  const guests = doc.data().guests || [];
  if (!guests.includes(name)) {
    await meetingRef.update({ guests: [...guests, name] });
  }
  res.json({ success: true });
});

// API: отменить запись
app.post('/api/meetings/:id/cancel', async (req, res) => {
  const { name } = req.body;
  const meetingRef = db.collection('meetings').doc(req.params.id);
  const doc = await meetingRef.get();
  const guests = doc.data().guests || [];
  const newGuests = guests.filter(g => g !== name);
  await meetingRef.update({ guests: newGuests });
  res.json({ success: true });
});

// API: добавить встречу
app.post('/api/meetings', async (req, res) => {
  const { secret, meeting } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Неавторизовано' });
  }
  const newId = Date.now().toString();
  await db.collection('meetings').doc(newId).set({
    ...meeting,
    id: newId,
    guests: []
  });
  res.json({ success: true });
});

// API: удалить встречу
app.delete('/api/meetings/:id', async (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Неавторизовано' });
  }
  await db.collection('meetings').doc(req.params.id).delete();
  res.json({ success: true });
});

// API: проверка имени
app.post('/api/check-username', async (req, res) => {
  const { username } = req.body;
  const snapshot = await db.collection('meetings').get();
  let existingUsers = new Set();
  snapshot.forEach(doc => {
    const guests = doc.data().guests || [];
    guests.forEach(guest => existingUsers.add(guest));
  });
  res.json({ available: !existingUsers.has(username) });
});

// API: регистрация устройства
app.post('/api/register-device', async (req, res) => {
  const { fingerprint, username } = req.body;
  const deviceDoc = await db.collection('devices').doc(fingerprint).get();
  
  if (!deviceDoc.exists && username) {
    await db.collection('devices').doc(fingerprint).set({
      username: username,
      lastUsed: new Date().toISOString()
    });
  }
  res.json({ success: true, username: deviceDoc.exists ? deviceDoc.data().username : username });
});

// API: отправка кода
app.post('/api/send-code', async (req, res) => {
  const { email, code } = req.body;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Книжный клуб <noreply@mail.tulabook.ru>',
      to: email,
      subject: 'Код подтверждения',
      html: `<p>Ваш код: <strong>${code}</strong></p>`
    })
  });
  
  const data = await response.json();
  res.status(response.status).json(data);
});

// Раздача статики
app.use(express.static('public'));

module.exports = app;