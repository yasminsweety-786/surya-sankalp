import React, { useState } from 'react';

const Contact = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Contact form submitted:', { name, email, message });
    setSubmitted(true);
    setName('');
    setEmail('');
    setMessage('');
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl text-white font-sans">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold font-mono text-yellow-400 mb-2">
          Contact Surya Sankalp
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Have queries about rooftop solar feasibility, DISCOM net metering, or urban solar planning? Reach out to our team.
        </p>

        {submitted ? (
          <div className="bg-green-900/50 border border-green-600 text-green-300 p-4 rounded-lg mb-6">
            Thank you for reaching out! Your query has been received by the Surya Sankalp team.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-400"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">Your Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ramesh@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-400"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">Your Message or Query</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your rooftop, solar inquiry, or partnership questions..."
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-400"
              required
            ></textarea>
          </div>
          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold py-3 px-6 rounded-lg transition duration-200"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
};

export default Contact;
