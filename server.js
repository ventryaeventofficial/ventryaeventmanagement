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
  vendors: { type: Array, default: [] }, // <--- REQUIRED so Mongoose saves vendors
  createdAt: { type: Date, default: Date.now }
});

const attendeeSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true, lowercase: true }, // Added email field
  createdAt: { type: Date, default: Date.now },
  isCheckedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date },
  tableNumber: { type: String, default: 'Unassigned' },
  seatNumber: { type: String, default: '' }
});

const Event = mongoose.model('Event', eventSchema);
const Attendee = mongoose.model('Attendee', attendeeSchema);

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

    // Allow modifications up to 24 hours after the event date
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

// Serve static files from your frontend directory (e.g., 'public' or 'dist')
app.use(express.static(path.join(__dirname, 'Ventrya')));

// Fallback to index.html for single-page applications if needed
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'Ventrya', 'index.html'));
});

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

// Get user events
app.get('/api/user-events', verifyFirebaseToken, async (req, res) => {
  try {
    const events = await Event.find({ organizerUid: req.user.uid }).sort({ createdAt: -1 });
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// Initialize Paystack Checkout with Proration / Upgrade Credit
app.post('/api/events/:id/checkout', verifyFirebaseToken, async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Missing Paystack Secret Key' });
    }

    const { id } = req.params;
    const { plan } = req.body; // Target plan user wants to upgrade to

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ success: false, error: 'Invalid plan selected' });
    }

    const event = await Event.findOne({ _id: id, organizerUid: req.user.uid });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Determine current plan price in Kobo (default to 0 if free or unpaid)
    const currentPlanKey = event.paymentStatus === 'paid' ? event.plan : 'free';
    const currentPlanPriceKobo = PLAN_PRICES[currentPlanKey] || 0;
    
    const targetPlanPriceKobo = PLAN_PRICES[plan];

    // Calculate net amount (Ensure it doesn't go below 0)
    let netAmountKobo = targetPlanPriceKobo - currentPlanPriceKobo;
    if (netAmountKobo < 0) netAmountKobo = 0;

    // If net amount is 0 (e.g. lateral or lower move), you can handle it directly or charge a minimum baseline
    if (netAmountKobo === 0) {
      return res.status(400).json({ success: false, error: 'You are already on this plan or a higher tier.' });
    }

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email || 'customer@ventrya.com',
        amount: netAmountKobo, // Charged with the prorated difference!
        metadata: { 
          eventId: id, 
          organizerUid: req.user.uid, 
          plan, 
          previousPlan: currentPlanKey,
          creditApplied: currentPlanPriceKobo 
        },
        callback_url: `http://127.0.0.1:5500/pricing.html?eventId=${id}&status=verify`
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
      netAmountCharged: netAmountKobo / 100 // Helpful for UI display if needed
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

// Get Event Attendees & Limit
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

// Add New Attendee
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

// Delete Attendee
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

// Upload E-Invite
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

// PUBLIC ROUTE: Get basic event details for RSVP page (No Auth Required)
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

// PUBLIC ROUTE: Guest Self-RSVP (No Auth Required)
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

    // Send the email via Resend API
    const response = await resend.emails.send({
      from: 'Ventrya Events <onboarding@resend.dev>', 
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
    console.error('RESEND ERROR DETAILS:', error); // <--- Logs exact failure reason to terminal
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- QR / SCANNER CHECK-IN ENDPOINT (Public & Matched to scanner.js) ---
app.post('/api/events/:id/checkin', async (req, res) => {
  try {
    const { id } = req.params;
    const { guestId } = req.body;

    if (!guestId) {
      return res.status(400).json({ success: false, error: 'Guest ID is required.' });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const attendee = await Attendee.findOne({ _id: guestId, eventId: id });
    if (!attendee) {
      return res.status(404).json({ success: false, error: 'Pass invalid or not found for this event.' });
    }

    if (attendee.isCheckedIn) {
      return res.status(409).json({ 
        success: false, 
        guest,
        error: `${attendee.name} is already checked in!` 
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

// GET /api/events/:eventId/attendees/:guestId
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
        eInviteUrl: event.eInviteUrl || '' // FIXED: Correct schema property
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

// GET /api/events/:eventId/checked-in - Fetch all checked-in guests for an event
app.get('/api/events/:eventId/checked-in', async (req, res) => {
  try {
    const { eventId } = req.params;

    // 1. Validate Mongo ObjectId to avoid CastError 500
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, error: 'Invalid Event ID format' });
    }

    // 2. Fetch event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // 3. Fetch checked-in guests
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
        phone: g.phone || 'N/A', // Updated to match schema property
        checkedInAt: g.checkedInAt ? new Date(g.checkedInAt).toLocaleString() : 'N/A'
      }))
    });
  } catch (err) {
    console.error("Error retrieving checked-in guests:", err);
    res.status(500).json({ success: false, error: 'Failed to retrieve checked-in guests' });
  }
});

// POST /api/events/:eventId/attendees/:guestId/manual-checkin - Manual Check-In
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

// PUT /api/events/:eventId/attendees/:guestId/seating - Assign table/seat to a guest
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

// GET /api/events/:eventId/seating-chart - Get seating stats & grouped tables
app.get('/api/events/:eventId/seating-chart', verifyFirebaseToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findOne({ _id: eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    const attendees = await Attendee.find({ eventId }).sort({ tableNumber: 1, name: 1 });

    // Group guests by table number
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

// GET vendors for an event
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

// POST add a vendor
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
    
    event.markModified('vendors'); // <--- CRITICAL: Tells Mongoose to save the array changes
    await event.save();

    res.json({ success: true, message: 'Vendor added successfully', vendor: newVendor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update vendor status inline from table dropdown
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

    event.markModified('vendors'); // <--- CRITICAL: Tells Mongoose to save the array changes
    await event.save();

    res.json({ success: true, message: 'Vendor status updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE remove a vendor
app.delete('/api/events/:eventId/vendors/:vendorId', verifyFirebaseToken, enforceActiveEvent, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, organizerUid: req.user.uid });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or unauthorized' });

    event.vendors = (event.vendors || []).filter(v => v.id !== req.params.vendorId);
    
    event.markModified('vendors'); // <--- CRITICAL: Tells Mongoose to save the array changes
    await event.save();

    res.json({ success: true, message: 'Vendor removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));