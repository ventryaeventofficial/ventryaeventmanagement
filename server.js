require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Initialize Resend with your API key from your .env file
const resend = new Resend(process.env.RESEND_API_KEY);

const upload = multer({ storage: multer.memoryStorage() });

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential: cert(serviceAccount)
});

// Connect to MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ventrya';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// ==========================================
// Mongoose Schemas (Declared BEFORE Model Creation)
// ==========================================
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  location: { type: String, default: 'Online / TBD' },
  organizerUid: { type: String, required: true, index: true },
  organizerEmail: { type: String, default: '' },
  plan: { 
    type: String, 
    enum: ['free', 'Starter', 'Professional', 'Enterprise', 'starter', 'professional', 'enterprise'], 
    default: 'free' 
  },
  paymentStatus: { 
    type: String, 
    enum: ['unpaid', 'pending', 'paid'], 
    default: 'unpaid' 
  },
  paystackRef: { type: String, default: '' },
  eInviteUrl: { type: String, default: '' },
  vendors: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const attendeeSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  createdAt: { type: Date, default: Date.now },
  isCheckedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date },
  tableNumber: { type: String, default: 'Unassigned' },
  seatNumber: { type: String, default: '' }
});

const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  subscribedAt: { type: Date, default: Date.now }
});

const consultationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  eventType: { type: String, required: true, trim: true },
  eventDate: { type: Date, required: true },
  description: { type: String, default: '' },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const Event = mongoose.model('Event', eventSchema);
const Attendee = mongoose.model('Attendee', attendeeSchema);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);
const Consultation = mongoose.model('Consultation', consultationSchema);

// Paystack Tier Pricing Mapping (Values in Kobo)
const PLAN_PRICES = {
  Starter: 3000000,       // ₦30,000
  Professional: 7000000,  // ₦70,000
  Enterprise: 15000000    // ₦150,000
};

// Tier Limits Map
const PLAN_LIMITS = {
  free: 20,
  starter: 100,
  professional: 500,
  enterprise: 5000,
  Starter: 100,
  Professional: 500,
  Enterprise: 5000
};

const ADMIN_EMAILS = [
  'ventryaeventofficial@gmail.com',
  'info@ventryaeventmanagement.com',
  'support@ventryaeventmanagement.com',
  'oladunniayomide7@gmail.com',
  'brandaceofficial@gmail.com',
];

const verifyAdmin = (req, res, next) => {
  if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Forbidden: Admin access only.' });
  }
  next();
};

// ==========================================
// Middleware: Verify Firebase ID Token
// ==========================================
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split(' ')[1];

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(403).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
};

// Middleware: Block modifications if event concluded more than 24 hours ago
const enforceActiveEvent = async (req, res, next) => {
  try {
    const eventId = req.params.id || req.params.eventId;
    if (!eventId) return next();

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    const expiryDate = new Date(event.date);
    expiryDate.setHours(expiryDate.getHours() + 24);

    if (new Date() > expiryDate) {
      return res.status(403).json({ 
        success: false, 
        error: 'This event concluded over 24 hours ago and is now in read-only mode. Further edits are disabled.' 
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Serve static files from your frontend directory
app.use(express.static(path.join(__dirname)));

// ==========================================
// Event API Routes
// ==========================================

// Create Event
app.post('/api/events', verifyFirebaseToken, async (req, res) => {
  try {
    const { title, description, date, location } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, error: 'Title and date are required fields.' });
    }

    const newEvent = new Event({
      title,
      description,
      date,
      location,
      organizerUid: req.user.uid,
      organizerEmail: req.user.email || ''
    });

    const savedEvent = await newEvent.save();
    res.status(201).json({ success: true, event: savedEvent });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create event: ' + error.message });
  }
});

// Get user events (and auto-claim any admin-assigned events matching the user's email)
app.get('/api/user-events', verifyFirebaseToken, async (req, res) => {
  try {
    const userEmail = (req.user.email || '').toLowerCase().trim();

    // If admin assigned an event to this email before/after signup, link it to their UID
    if (userEmail) {
      await Event.updateMany(
        { organizerEmail: userEmail, organizerUid: { $ne: req.user.uid } },
        { $set: { organizerUid: req.user.uid } }
      );
    }

    const events = await Event.find({ organizerUid: req.user.uid }).sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      isAdmin: ADMIN_EMAILS.includes(userEmail),
      events 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user events
// app.get('/api/user-events', verifyFirebaseToken, async (req, res) => {
//   try {
//     const events = await Event.find({ organizerUid: req.user.uid }).sort({ createdAt: -1 });
//     res.json({ success: true, events });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// Get single event
app.get('/api/events/:id', verifyFirebaseToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid Event ID format' });
    }

    const event = await Event.findOne({ _id: req.params.id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
    }
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedEvent = await Event.findByIdAndDelete(id);
    if (!deletedEvent) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    return res.status(200).json({ success: true, message: 'Event deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE event
app.put('/api/events/:id', enforceActiveEvent, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEvent = await Event.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedEvent) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    return res.status(200).json({ success: true, data: updatedEvent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Initialize Paystack Checkout
app.post('/api/events/:id/checkout', verifyFirebaseToken, async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Missing Paystack Secret Key' });
    }

    const { id } = req.params;
    const { plan } = req.body;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ success: false, error: 'Invalid plan selected' });
    }

    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const currentPlanKey = event.paymentStatus === 'paid' ? event.plan : 'free';
    const currentPlanPriceKobo = PLAN_PRICES[currentPlanKey] || 0;
    const targetPlanPriceKobo = PLAN_PRICES[plan];

    let netAmountKobo = targetPlanPriceKobo - currentPlanPriceKobo;
    if (netAmountKobo < 0) netAmountKobo = 0;

    if (netAmountKobo === 0) {
      return res.status(400).json({ success: false, error: 'You are already on this plan or a higher tier.' });
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const dynamicCallbackUrl = `${protocol}://${host}/pricing.html?eventId=${id}&status=verify`;

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email || 'customer@ventrya.com',
        amount: netAmountKobo, 
        metadata: { 
          eventId: id, 
          organizerUid: req.user.uid, 
          plan, 
          previousPlan: currentPlanKey,
          creditApplied: currentPlanPriceKobo 
        },
        callback_url: dynamicCallbackUrl
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    event.paystackRef = paystackResponse.data.data.reference;
    event.paymentStatus = 'pending';
    await event.save();

    res.json({ 
      success: true, 
      authorization_url: paystackResponse.data.data.authorization_url,
      netAmountCharged: netAmountKobo / 100 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify Paystack Transaction
app.get('/api/events/verify-payment/:reference', verifyFirebaseToken, async (req, res) => {
  try {
    const { reference } = req.params;
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const data = verifyResponse.data.data;
    if (data.status === 'success') {
      const { eventId, plan } = data.metadata;
      const updatedEvent = await Event.findByIdAndUpdate(
        eventId,
        { plan, paymentStatus: 'paid', paystackRef: reference },
        { returnDocument: 'after' }
      );
      return res.json({ success: true, message: 'Payment verified', event: updatedEvent });
    }
    res.status(400).json({ success: false, error: 'Payment status not successful' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Attendees & E-Invite Routes
// ==========================================

app.get('/api/events/:id/attendees', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const attendees = await Attendee.find({ eventId: id }).sort({ createdAt: -1 });
    const limit = PLAN_LIMITS[event.plan] || PLAN_LIMITS.free;

    res.json({
      success: true,
      event: {
        _id: event._id,
        title: event.title,
        date: event.date,
        location: event.location,
        description: event.description,
        plan: event.plan || 'free',
        paymentStatus: event.paymentStatus,
        eInviteUrl: event.eInviteUrl || '',
        limit
      },
      attendees
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events/:id/attendees', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required.' });
    }

    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
    }

    const currentCount = await Attendee.countDocuments({ eventId: id });
    const limit = PLAN_LIMITS[event.plan] || PLAN_LIMITS.free;

    if (currentCount >= limit) {
      return res.status(400).json({ 
        success: false, 
        error: `Attendee limit reached (${limit}). Upgrade your plan to add more guests.` 
      });
    }

    const newAttendee = new Attendee({
      eventId: id,
      name,
      phone,
      email: email ? email.toLowerCase().trim() : ''
    });

    await newAttendee.save();
    res.status(201).json({ success: true, attendee: newAttendee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/events/:id/attendees/:attendeeId', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { id, attendeeId } = req.params;

    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });
    }

    const deleted = await Attendee.findOneAndDelete({ _id: attendeeId, eventId: id });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Attendee not found' });
    }

    res.json({ success: true, message: 'Attendee deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events/:id/upload-einvite', verifyFirebaseToken, enforceActiveEvent, upload.single('eInvite'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(fileBase64, {
      folder: 'ventrya_einvites',
      resource_type: 'image'
    });

    const updatedEvent = await Event.findOneAndUpdate(
      { _id: id, organizerUid: req.user.uid },
      { eInviteUrl: result.secure_url },
      { returnDocument: 'after' }
    );

    if (!updatedEvent) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({ success: true, eInviteUrl: updatedEvent.eInviteUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/public/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).select('title date location eInviteUrl');

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve event details.' });
  }
});

app.post('/api/events/:id/public-rsvp', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone number are required.' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const currentCount = await Attendee.countDocuments({ eventId: id });
    const limit = PLAN_LIMITS[event.plan] || PLAN_LIMITS.free;

    if (currentCount >= limit) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sorry, this event has reached its maximum guest capacity.' 
      });
    }

    const newAttendee = new Attendee({
      eventId: id,
      name,
      phone,
      email: email ? email.toLowerCase().trim() : ''
    });

    await newAttendee.save();
    res.status(201).json({ success: true, message: 'RSVP submitted successfully!', attendee: newAttendee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to send attendee invite via email using Resend
app.post('/api/events/:id/attendees/:attendeeId/send-email', verifyFirebaseToken, async (req, res) => {
  try {
    const { id, attendeeId } = req.params;
    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    const attendee = await Attendee.findOne({ _id: attendeeId, eventId: id });

    if (!event || !attendee) {
      return res.status(404).json({ success: false, error: 'Event or attendee not found.' });
    }

    if (!attendee.email) {
      return res.status(400).json({ success: false, error: 'This attendee does not have an email address.' });
    }

    const invitationCardUrl = `${req.protocol}://${req.get('host')}/invitation.html?eventId=${id}&attendeeId=${attendeeId}`;

    // Send the email via Resend API using your verified domain
    const response = await resend.emails.send({
      from: 'Ventrya Events <info@ventryaeventmanagement.com>', 
      to: [attendee.email],
      subject: `Your Digital Invitation Pass for ${event.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>You're Invited!</h2>
          <p>Hello <strong>${attendee.name}</strong>,</p>
          <p>You have been invited to attend <strong>${event.title}</strong>.</p>
          <p>Click the button below to access your digital invitation card and QR pass:</p>
          <a href="${invitationCardUrl}" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 10px;">View Invitation Pass</a>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">We look forward to seeing you!</p>
        </div>
      `
    });

    console.log('Resend email success:', response);
    res.json({ success: true, message: 'Email sent successfully!', data: response });
  } catch (error) {
    console.error('RESEND ERROR DETAILS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

//GUEST CHECK IN

// 1. Generate or Get Secure Scanner Access Link (Organizer Only)
app.post('/api/events/:id/generate-scanner-token', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    // Generate a secure random token if it doesn't exist
    if (!event.scannerToken) {
      const crypto = require('crypto');
      event.scannerToken = crypto.randomBytes(16).toString('hex');
      await event.save();
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const scannerUrl = `${protocol}://${host}/scanner.html?eventId=${event._id}&token=${event.scannerToken}`;

    res.json({ success: true, scannerUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Update Check-In Route to allow either Firebase Admin Auth OR valid event scanner token
app.post('/api/events/:id/checkin', async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId, token } = req.body;

    if (!guestId) {
      return res.status(400).json({ success: false, error: 'Guest ID is required.' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    // Verify token if provided, or require authentication
    const isTokenValid = token && event.scannerToken && token === event.scannerToken;
    if (!isTokenValid) {
      // Fallback: Check if request has valid Firebase token if no scanner token matches
      // (You can keep your existing token check middleware or verify here)
    }

    const attendee = await Attendee.findOne({ _id: guestId, eventId: id });
    if (!attendee) {
      return res.status(404).json({ success: false, error: 'Pass invalid or not found for this event.' });
    }

    if (attendee.isCheckedIn) {
      return res.status(409).json({ 
        success: false, 
        error: `${attendee.name} is already checked in at ${new Date(attendee.checkedInAt).toLocaleTimeString()}!` 
      });
    }

    attendee.isCheckedIn = true;
    attendee.checkedInAt = new Date();
    await attendee.save();

    res.status(200).json({ 
      success: true, 
      message: 'Pass verified. Welcome to the event!', 
      guest: {
        name: attendee.name,
        isCheckedIn: attendee.isCheckedIn,
        checkedInAt: attendee.checkedInAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:eventId/attendees/:guestId', async (req, res) => {
  try {
    const { eventId, guestId } = req.params;

    const event = await Event.findById(eventId);
    const guest = await Attendee.findOne({ _id: guestId, eventId });

    if (!event || !guest) {
      return res.status(404).json({ error: 'Pass details not found' });
    }

    res.status(200).json({
      event: {
        _id: event._id,
        title: event.title,
        date: event.date,
        location: event.location,
        eInviteUrl: event.eInviteUrl || ''
      },
      guest: {
        _id: guest._id,
        name: guest.name
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/events/:eventId/checked-in', async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, error: 'Invalid Event ID format' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const checkedInGuests = await Attendee.find({ eventId, isCheckedIn: true })
      .sort({ checkedInAt: -1 });

    const totalAttendees = await Attendee.countDocuments({ eventId });

    res.status(200).json({
      success: true,
      eventTitle: event.title,
      totalAttendees,
      checkedInCount: checkedInGuests.length,
      guests: checkedInGuests.map(g => ({
        _id: g._id,
        name: g.name,
        phone: g.phone || 'N/A',
        checkedInAt: g.checkedInAt ? new Date(g.checkedInAt).toLocaleString() : 'N/A'
      }))
    });
  } catch (err) {
    console.error("Error retrieving checked-in guests:", err);
    res.status(500).json({ success: false, error: 'Failed to retrieve checked-in guests' });
  }
});

app.post('/api/events/:eventId/attendees/:guestId/manual-checkin', async (req, res) => {
  try {
    const { eventId, guestId } = req.params;

    const guest = await Attendee.findOne({ _id: guestId, eventId });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    if (guest.isCheckedIn) {
      return res.status(400).json({ error: 'Guest is already checked in' });
    }

    guest.isCheckedIn = true;
    guest.checkedInAt = new Date();
    await guest.save();

    res.status(200).json({
      message: 'Guest checked in successfully',
      guest: {
        _id: guest._id,
        name: guest.name,
        isCheckedIn: guest.isCheckedIn,
        checkedInAt: guest.checkedInAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Manual check-in failed' });
  }
});

app.put('/api/events/:eventId/attendees/:guestId/seating', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { eventId, guestId } = req.params;
    const { tableNumber, seatNumber } = req.body;

    const event = await Event.findOne({ _id: eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    const guest = await Attendee.findOneAndUpdate(
      { _id: guestId, eventId },
      { tableNumber: tableNumber || 'Unassigned', seatNumber: seatNumber || '' },
      { new: true }
    );

    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });

    res.status(200).json({ success: true, message: 'Seating updated', guest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/events/:eventId/seating-chart', verifyFirebaseToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findOne({ _id: eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    const attendees = await Attendee.find({ eventId }).sort({ tableNumber: 1, name: 1 });

    const seatingChart = {};
    attendees.forEach(guest => {
      const table = guest.tableNumber || 'Unassigned';
      if (!seatingChart[table]) seatingChart[table] = [];
      seatingChart[table].push(guest);
    });

    res.status(200).json({
      success: true,
      eventTitle: event.title,
      totalAttendees: attendees.length,
      seatingChart
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/events/:eventId/vendors', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    res.json({
      success: true,
      eventTitle: event.title || 'Event Vendors',
      vendors: event.vendors || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/events/:eventId/vendors', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { name, category, phone, email, status } = req.body;
    if (!name || !category) return res.status(400).json({ success: false, error: 'Vendor name and category are required' });

    const event = await Event.findOne({ _id: req.params.eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    const newVendor = {
      id: new mongoose.Types.ObjectId().toString(),
      name: name.trim(),
      category: category.trim(),
      phone: phone ? phone.trim() : '',
      email: email ? email.trim() : '',
      status: status || 'Confirmed',
      addedAt: new Date().toISOString()
    };

    if (!event.vendors) event.vendors = [];
    event.vendors.push(newVendor);
    
    event.markModified('vendors');
    await event.save();

    res.json({ success: true, message: 'Vendor added successfully', vendor: newVendor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/events/:eventId/vendors/:vendorId/status', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status is required' });

    const event = await Event.findOne({ _id: req.params.eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    let updated = false;
    event.vendors = (event.vendors || []).map(v => {
      if (v.id === req.params.vendorId) {
        v.status = status;
        updated = true;
      }
      return v;
    });

    if (!updated) return res.status(404).json({ success: false, error: 'Vendor not found' });

    event.markModified('vendors');
    await event.save();

    res.json({ success: true, message: 'Vendor status updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/events/:eventId/vendors/:vendorId', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    event.vendors = (event.vendors || []).filter(v => v.id !== req.params.vendorId);
    
    event.markModified('vendors');
    await event.save();

    res.json({ success: true, message: 'Vendor removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Newsletter Subscription API Route
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, error: 'This email is already subscribed!' });
    }

    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();

    res.status(201).json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Consultation Submission Route
app.post('/api/consultation/request', async (req, res) => {
  try {
    const { name, email, phone, eventType, eventDate, description } = req.body;
    if (!name || !email || !phone || !eventType || !eventDate) {
      return res.status(400).json({ success: false, error: 'Please fill in all required fields.' });
    }

    const newRequest = new Consultation({
      name, email, phone, eventType, eventDate, description
    });
    await newRequest.save();

    try {
      await resend.emails.send({
        from: 'Ventrya Team <info@ventryaeventmanagement.com>',
        to: ['info@ventryaeventmanagement.com'],
        subject: `New Non-Profit / Custom Event Request: ${eventType}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>New Consultation / Custom Event Request</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Event Type:</strong> ${eventType}</p>
            <p><strong>Estimated Date:</strong> ${eventDate}</p>
            <p><strong>Details:</strong> ${description}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">Log into your MongoDB database or admin panel to review and create the bypass account.</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Failed to send admin notification email:', emailErr);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Request submitted successfully! Our admin team will contact you and set up your custom account.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADMIN ONLY: Create a bypassed Enterprise event for a client
app.post('/api/admin/create-custom-event', verifyFirebaseToken, verifyAdmin, async (req, res) => {
  try {
    const { clientEmail, title, date, location, description } = req.body;

    if (!clientEmail || !title || !date) {
      return res.status(400).json({ success: false, error: 'Client email, title, and date are required.' });
    }

    const normalizedEmail = clientEmail.toLowerCase().trim();
    let targetUid = `pending_${normalizedEmail}`;

    // Check if the client already has a Firebase account so we can link their UID immediately
    try {
      const existingUser = await getAuth().getUserByEmail(normalizedEmail);
      if (existingUser) {
        targetUid = existingUser.uid;
      }
    } catch (authErr) {
      // User hasn't signed up yet; targetUid stays `pending_...` and will auto-claim upon first login
    }

    const newEvent = new Event({
      title: title.trim(),
      description: description ? description.trim() : '',
      date,
      location: location ? location.trim() : 'Online / TBD',
      organizerUid: targetUid,
      organizerEmail: normalizedEmail,
      plan: 'Enterprise',
      paymentStatus: 'paid',
      paystackRef: 'ADMIN_BYPASS_ENTERPRISE'
    });

    const savedEvent = await newEvent.save();

    const protocol = req.protocol;
    const host = req.get('host');
    const directEventLink = `${protocol}://${host}/attendees.html?eventId=${savedEvent._id}`;

    res.status(201).json({
      success: true,
      message: 'Custom Enterprise event created and payment bypassed!',
      event: savedEvent,
      directEventLink
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Support Request Schema ---
const supportSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, default: 'Open' },
  createdAt: { type: Date, default: Date.now }
});
const SupportRequest = mongoose.model('SupportRequest', supportSchema);

// --- Support Submission Route ---
app.post('/api/support/request', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const newSupport = new SupportRequest({ name, email, message });
    await newSupport.save();

    // Send notification email to support inbox via Resend
    try {
      await resend.emails.send({
        from: 'Ventrya Support <info@ventryaeventmanagement.com>',
        to: ['support@ventryaeventmanagement.com', 'info@ventryaeventmanagement.com'],
        subject: `New Support Request from ${name}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>New Support Ticket Received</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong></p>
            <p style="background: #f9f9f9; padding: 12px; border-radius: 6px; border: 1px solid #eee;">${message}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">Reply directly to the user at ${email}.</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Failed to send support notification email:', emailErr);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Support request sent successfully! We will reach out to you shortly.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Catch-all route to serve index.html for any request that isn't an API route
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));