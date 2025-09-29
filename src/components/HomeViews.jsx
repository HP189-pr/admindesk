import React from 'react';

// Transcript View
const Verification = () => (
  <div className="p-4 bg-white shadow rounded">
    <h3 className="font-semibold">📄 Transcript View</h3>
    <p>This is the transcript section.</p>
  </div>
);

// Migration View
const Migration = () => (
  <div className="p-4 bg-white shadow rounded">
    <h3 className="font-semibold">🚀 Migration View</h3>
    <p>This is the migration section.</p>
  </div>
);

// Birthday Reminder View
const BirthdayReminder = () => (
  <div className="p-4 bg-white shadow rounded">
    <h3 className="font-semibold">🎂 Birthday Reminder</h3>
    <p>These are the upcoming birthdays.</p>
  </div>
);

// Chatbox View (default view if no others selected)
const ChatBox = () => (
  <div className="p-4 bg-white shadow rounded">
    <h3 className="font-semibold">💬 Chatbox View</h3>
    <p>Welcome to the chatbox.</p>
  </div>
);

// Attendance View
const Attendance = () => (
  <div className="p-4 bg-white shadow rounded">
    <h3 className="font-semibold">📊 Attendance View</h3>
    <p>This is the attendance section.</p>
  </div>
);

// Master Object - Key-Value mapping for views
const HomeViews = {
  verification: Verification,
  migration: Migration,
  birthdayReminder: BirthdayReminder,
  chatbox: ChatBox,
  attendance: Attendance,
};

export default HomeViews;
