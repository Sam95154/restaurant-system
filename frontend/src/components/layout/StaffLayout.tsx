import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';

interface StaffLayoutProps {
  children: React.ReactNode;
}

export default function StaffLayout({
  children,
}: StaffLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream text-coffee-dark lg:flex">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <TopHeader
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="min-h-[calc(100vh-5rem)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}