import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-xl border border-border text-center">
        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          Spell Failed
        </h1>
        <p className="text-muted-foreground mb-8">
          The magical page you seek does not exist or has vanished into the void.
        </p>

        <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          Return Home
        </Link>
      </div>
    </div>
  );
}
