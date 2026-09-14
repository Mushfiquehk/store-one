import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

interface PinProtectionProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  requiredPin?: string; // If not provided, will accept any valid pin (in real app, would validate against user)
}

export function PinProtection({ isOpen, onClose, onSuccess, title = "Enter PIN", requiredPin = "1234" }: PinProtectionProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError(false);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (pin === requiredPin) {
      onSuccess();
      onClose();
    } else {
      setError(true);
      setPin("");
    }
  };

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
           <div className="flex justify-center gap-2 mb-4">
             {[0, 1, 2, 3].map((i) => (
               <div 
                 key={i} 
                 className={`h-3 w-3 rounded-full transition-all ${i < pin.length ? (error ? "bg-destructive" : "bg-primary") : "bg-muted"}`}
               />
             ))}
           </div>
           
           {error && <p className="text-center text-xs text-destructive font-medium animate-pulse">Incorrect PIN. Try again.</p>}

           <div className="grid grid-cols-3 gap-3">
             {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
               <Button 
                 key={num} 
                 variant="outline" 
                 className="h-12 text-lg font-medium rounded-xl hover:bg-secondary"
                 onClick={() => handleNumberClick(num.toString())}
               >
                 {num}
               </Button>
             ))}
             <Button variant="ghost" className="h-12" onClick={handleBackspace}>Del</Button>
             <Button 
               variant="outline" 
               className="h-12 text-lg font-medium rounded-xl hover:bg-secondary"
               onClick={() => handleNumberClick("0")}
             >
               0
             </Button>
             <Button variant="default" className="h-12" onClick={handleSubmit}>OK</Button>
           </div>
           
           <p className="text-center text-[10px] text-muted-foreground mt-2">
              Default PIN: 1234
           </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
