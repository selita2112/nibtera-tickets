
'use client';

import { Facebook, Instagram, Linkedin, Youtube, Send } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-header-background text-header-foreground">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">TICKETBOX</h3>
            <p className="text-sm text-muted-foreground">Your one-stop shop for event tickets. Discover, book, and enjoy.</p>
             <div className="flex space-x-4 mt-4">
              <Link href="https://web.facebook.com/nib.intbank" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </Link>
              <Link href="https://www.linkedin.com/company/nib-internationalbank" target="_blank" rel="noopener noreferrer" aria-label="Linkedin" className="hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </Link>
              <Link href="https://www.instagram.com/nib_internationalbank/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </Link>
              <Link href="https://www.youtube.com/channel/UCn_-tUsAPEKdzm_b2BOCOdA" target="_blank" rel="noopener noreferrer" aria-label="Youtube" className="hover:text-primary transition-colors">
                <Youtube className="h-5 w-5" />
              </Link>
              <Link href="https://t.me/nibinternationalbanksc" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="hover:text-primary transition-colors">
                <Send className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="text-muted-foreground hover:text-primary">Home</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-primary">Events</Link></li>
              <li><Link href="/login" className="text-muted-foreground hover:text-primary">Organizer Login</Link></li>
              <li><Link href="/tickets" className="text-muted-foreground hover:text-primary">My Tickets</Link></li>
            </ul>
          </div>
           <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="#" className="text-muted-foreground hover:text-primary">Help Center</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-primary">Terms of Service</Link></li>
              <li><Link href="#" className="text-muted-foreground hover:text-primary">Privacy Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Newsletter</h3>
            <p className="text-sm text-muted-foreground mb-3">Stay up to date with our latest events and offers.</p>
            {/* Newsletter form can be added here */}
          </div>
        </div>
         <div className="mt-8 border-t border-gray-700 pt-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} NibTera Tickets. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
