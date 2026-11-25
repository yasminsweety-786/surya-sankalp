import React from 'react';
import SignupForm from './SignupForm';
import LoginForm from './LoginForm';

export default function Template({ formtype, setIsLoggedIn }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-4 py-12">
      <div className="w-full max-w-md">
        {formtype === "signup" ? (
          <SignupForm setIsLoggedIn={setIsLoggedIn} />
        ) : (
          <LoginForm setIsLoggedIn={setIsLoggedIn} />
        )}
      </div>
    </div>
  );
}
