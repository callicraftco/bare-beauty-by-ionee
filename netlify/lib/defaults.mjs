// Starting content, taken from Ionee's printed menu.
// Everything here is editable from the control panel at /admin.

const svc = (id, name, price, duration, extra = {}) => ({
  id,
  name,
  price,
  duration,
  durationLabel: '',
  badge: '',
  description: '',
  rebookDays: 0,
  online: true,
  visible: true,
  ...extra,
});

export const DEFAULT_SERVICES = {
  categories: [
    {
      id: 'facials',
      name: 'Facials',
      group: '',
      note: 'Every facial includes a double cleanse, exfoliation, extractions as needed, facial massage, mask, toner, serum, moisturizer and SPF.',
      services: [
        svc('classic-glow-facial', 'Classic Glow Facial', 60, 60, {
          durationLabel: '45 to 60 min',
          description: 'A relaxing, customized facial designed to cleanse, exfoliate and hydrate your skin. Perfect for all skin types and first-time clients.',
          rebookDays: 28,
        }),
        svc('glow-renewal-facial', 'Glow Renewal Facial', 75, 60, {
          durationLabel: '60 min',
          description: 'A deeper, results-driven facial to help maintain clear, healthy and radiant skin.',
          rebookDays: 28,
        }),
        svc('advanced-hydro-facial', 'Advanced Hydro-Facial', 90, 90, {
          durationLabel: '90 min',
          description: 'An innovative treatment combining hydrodermabrasion with peptide infusions for ultimate rejuvenation and radiance.',
          rebookDays: 28,
        }),
      ],
    },
    {
      id: 'wax-face',
      name: 'Face',
      group: 'Waxing',
      note: '',
      services: [
        svc('wax-upper-lip', 'Upper lip', 8, 10, { rebookDays: 28 }),
        svc('wax-chin', 'Chin', 10, 10, { rebookDays: 28 }),
        svc('wax-full-face', 'Full face', 40, 30, { description: 'Brows, lip and chin.', rebookDays: 28 }),
      ],
    },
    {
      id: 'wax-body',
      name: 'Body',
      group: 'Waxing',
      note: '',
      services: [
        svc('wax-underarms', 'Underarms', 15, 15, { rebookDays: 28 }),
        svc('wax-half-leg', 'Half leg', 25, 30, { rebookDays: 28 }),
        svc('wax-full-leg', 'Full leg', 50, 45, { rebookDays: 28 }),
        svc('wax-bikini', 'Bikini', 35, 30, { rebookDays: 28 }),
      ],
    },
    {
      id: 'lash-extensions',
      name: 'Extensions',
      group: 'Lashes',
      note: '',
      services: [
        svc('lash-classic-set', 'Classic full set', 70, 120, { rebookDays: 14 }),
        svc('lash-hybrid-set', 'Hybrid full set', 85, 150, { rebookDays: 14 }),
      ],
    },
    {
      id: 'lash-fills',
      name: 'Fills',
      group: 'Lashes',
      note: 'For lashes done within the last 2 weeks.',
      services: [
        svc('lash-classic-fill', 'Classic fill', 65, 60, { rebookDays: 14 }),
        svc('lash-hybrid-fill', 'Hybrid fill', 75, 75, { rebookDays: 14 }),
      ],
    },
    {
      id: 'lash-lift',
      name: 'Lift',
      group: 'Lashes',
      note: 'Lifted, curled, effortless.',
      services: [
        svc('korean-lash-lift', 'Korean lash lift', 50, 60, {
          badge: 'Tint included',
          description: 'Enhances your natural lashes with a long-lasting curl that opens up your eyes. Lasts 6 to 8 weeks.',
          rebookDays: 49,
        }),
      ],
    },
  ],
};

export const DEFAULT_TEMPLATES = {
  confirm:
    "Hi {first}! You're confirmed for {services} on {date} at {time}. {address} See you soon!",
  reminder:
    'Hi {first}, a quick reminder about your {services} appointment on {date} at {time}. If anything changes, just text me back. See you soon!',
  decline:
    "Hi {first}, thank you for booking with me! {date} at {time} isn't available. Could another time work? You can pick one here: {book}",
  rebook:
    "Hi {first}! It's about time for your next {service}. Want me to save you a spot? You can book here: {book}",
  thanks:
    'Thank you for coming in today, {first}! If you love your results, a tag @{instagram} or a review means so much. Book your next visit anytime: {book}',
};

export const DEFAULT_FAQ = [
  {
    id: 'faq-book',
    q: 'How do I book?',
    a: "Pick your services and a time on the booking page, then add your details. You'll hear from me by text or email to confirm.",
  },
  {
    id: 'faq-facial',
    q: 'How should I prepare for a facial?',
    a: 'Come with a clean face if you can. Pause retinol, exfoliating acids and scrubs for 3 days before. Let me know about allergies, skin conditions or medications when you book.',
  },
  {
    id: 'faq-wax',
    q: 'How should I prepare for waxing?',
    a: 'Hair should be about 1/4 inch long, roughly 2 to 3 weeks of growth. Skip exfoliating and retinol for 2 days before, and avoid tanning the day of your appointment.',
  },
  {
    id: 'faq-lash',
    q: 'How should I prepare for lashes?',
    a: 'Arrive with clean lashes: no mascara, lash curler or oily makeup remover that day. Plan to relax with your eyes closed for the whole appointment.',
  },
  {
    id: 'faq-fill',
    q: 'When should I book a fill?',
    a: 'Fills are for lashes done within the last 2 weeks. If it has been longer, you may need a full set.',
  },
  {
    id: 'faq-cancel',
    q: "What if I need to cancel or I'm running late?",
    a: "Please give at least 24 hours' notice to cancel or change your time. Use the link in your confirmation or text me. If you're more than 15 minutes late, I may need to shorten or reschedule your service.",
  },
  {
    id: 'faq-pay',
    q: 'How do I pay?',
    a: 'Payment is due at your appointment.',
  },
];

const day = (open, start = '10:00', end = '18:00') => ({ open, start, end });

export const DEFAULT_SETTINGS = {
  business: {
    name: 'Bare Beauty by Ionee',
    tagline: 'Skin that glows, confidence that shows.',
    area: '',
    address: '',
    phone: '',
    email: '',
    instagram: 'barebeautybyionee',
    about:
      "Bare Beauty is my studio for facials, waxing and lashes. I keep things calm, clean and personal, so you can actually relax. Tell me what's going on with your skin or the look you want, and we'll take it from there.",
    announcement: '',
    timezone: 'America/New_York',
  },
  hours: {
    sun: day(false),
    mon: day(false),
    tue: day(true),
    wed: day(true),
    thu: day(true),
    fri: day(true),
    sat: day(true, '09:00', '15:00'),
  },
  booking: {
    mode: 'request', // 'request' = Ionee confirms each booking, 'instant' = confirmed right away
    step: 30,
    buffer: 15,
    minNoticeHours: 12,
    maxDaysAhead: 60,
    cancelNoticeHours: 24,
    paymentNote: '',
  },
  faq: DEFAULT_FAQ,
  templates: DEFAULT_TEMPLATES,
  privacy: {
    retentionYears: 3, // client records are erased this long after the last visit (0 = keep until deleted)
  },
  setup: { dismissed: false, hoursReviewed: false, menuReviewed: false, policiesReviewed: false },
};

// The date of the current booking terms and privacy policy. Change it whenever the
// pages at /terms/ and /privacy/ change, so each booking records which version was agreed to.
export const POLICY_VERSION = '2026-10-22';

export const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'declined', 'no-show'];
export const ACTIVE_STATUSES = ['pending', 'confirmed'];
