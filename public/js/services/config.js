// ================================================================
//  SETTINGS YOU MAY WANT TO CHANGE
// ================================================================

// Firebase project (this is public by design — security comes from
// firestore.rules, not from hiding these values).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDWQiPmNBnAtI-4Jd4WKvBKcd2l7g6HyA8',
  authDomain: 'sediment-defender.firebaseapp.com',
  projectId: 'sediment-defender',
  storageBucket: 'sediment-defender.firebasestorage.app',
  messagingSenderId: '13458489625',
  appId: '1:13458489625:web:1bd3d3475ebea5232d8588',
};

// Google accounts allowed into the teacher dashboard.
// IMPORTANT: keep this list in sync with isTeacher() in firestore.rules —
// the rules are what actually protect the data.
export const TEACHER_EMAILS = ['matthew.t.bennett95@gmail.com'];

// Roster groups that are always listed, no matter the school year.
export const STAFF_GROUPS = ['Teachers', 'Peer Leaders'];

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.0';

/** "2026-2027" style school year. August starts a new year. */
export function currentSchoolYear(date = new Date()) {
  const y = date.getFullYear();
  return date.getMonth() + 1 >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
