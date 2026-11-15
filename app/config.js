/*
  YOUR SETTINGS
  -------------
  This is the only file you need to edit to make the app yours.
  Open it in Notepad, change the words between the quote marks, and save.

  "Talk to a consultant" works in two ways. You can use one or both:

    1. YOUR WEBSITE. Put your website address in "website" below.
       The consultant screen then shows a button that opens your site inside the app.

    2. THE BUILT-IN REQUEST FORM. Fill in "formEmail" and every request
       lands in that inbox. You can also fill in "whatsapp" so people can
       send the same request to you on WhatsApp instead.

  Until you fill in at least one of these, the consultant screen says
  "Consultations are not open yet".
*/
window.APP_CONFIG = {

  // The name shown in the app and on shared pictures.
  brand: 'Threshold',

  // The look people see first: 'light' or 'dark'.
  // They can change it for themselves in Settings.
  look: 'light',

  // Anonymous visit count. It adds one to a counter each time the app is opened
  // and each time a tool is opened. It records nothing people type.
  // Open numbers.html (next to this file, once the app is online) to see the totals.
  // Set on: false to switch counting off. Do not change the name once you are live,
  // or the totals start again from zero.
  visitCount: { on: true, name: 'threshold-zeucj9q4' },

  // The money sign used in every calculator.
  currency: 'AED',

  consultant: {
    // Who people will be talking to. Leave name empty to just say "a consultant".
    name: 'Roohan',
    title: 'Property consultant',

    // 1. Your website. Example: 'https://www.yourname.com'
    website: '',
    // The words on the button that opens it.
    websiteLabel: 'Visit my website',
    // true  = the site opens inside the app (some sites refuse to be shown this way)
    // false = the site opens in the phone's browser
    websiteInsideApp: true,

    // 2. The request form.
    // The email address that should RECEIVE the filled-in forms. Example: 'you@gmail.com'
    // When this is filled in, the form has a "Send request" button and each request
    // arrives in that inbox as an email. The very first request triggers a one-time
    // "activate" email from FormSubmit: open it and press the button, once.
    formEmail: 'thresholduae.app@gmail.com',
    // WhatsApp number with country code, digits only. Example: '971501234567'
    whatsapp: '971564638117',
    // Email address that requests should go to. Example: 'hello@yourdomain.com'
    email: '',
    // Phone number people can call. Example: '+971 50 123 4567'
    phone: '',
    // A booking page link, if you use one (Calendly, Cal.com, Google Calendar booking).
    bookingUrl: '',

    // Short lines shown on the consultant screen.
    promise: 'Consultations are free. No obligation.',
    responseTime: 'Replies within one working day.'
  }
};
