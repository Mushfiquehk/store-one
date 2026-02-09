import { useState } from "react";
import { motion } from "framer-motion";
import AppShell from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore, type Employee } from "@/lib/store";
import { Plus, User, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmployeesPage() {
  const { employees, addEmployee, updateEmployee } = useStore();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    role: "staff",
    payRate: "",
    pin: ""
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.payRate || !formData.pin) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }

    const payRateCents = Math.round(parseFloat(formData.payRate) * 100);

    if (editingId) {
      updateEmployee(editingId, {
        name: formData.name,
        // @ts-ignore
        role: formData.role,
        payRate: payRateCents,
        pin: formData.pin
      });
      toast({ title: "Success", description: "Employee updated" });
    } else {
      addEmployee({
        id: `emp_${Date.now()}`,
        name: formData.name,
        // @ts-ignore
        role: formData.role,
        payRate: payRateCents,
        pin: formData.pin
      });
      toast({ title: "Success", description: "Employee added" });
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: "", role: "staff", payRate: "", pin: "" });
    setEditingId(null);
  };

  const handleEdit = (emp: Employee) => {
    setFormData({
      name: emp.name,
      role: emp.role,
      payRate: (emp.payRate / 100).toFixed(2),
      pin: emp.pin
    });
    setEditingId(emp.id);
    setIsDialogOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Employees">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="border shadow-soft rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-serif">Staff Management</CardTitle>
                  <CardDescription>Manage team members and pay rates.</CardDescription>
                </div>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl">
                    <Plus className="h-4 w-4 mr-2" /> Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingId ? "Edit Employee" : "New Employee"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input 
                        id="name" 
                        value={formData.name} 
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                         <Label>Role</Label>
                         <Select 
                           value={formData.role} 
                           onValueChange={(val) => setFormData(prev => ({ ...prev, role: val }))}
                         >
                           <SelectTrigger>
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="manager">Manager</SelectItem>
                             <SelectItem value="staff">Staff</SelectItem>
                           </SelectContent>
                         </Select>
                      </div>
                      <div className="grid gap-2">
                         <Label htmlFor="pay">Hourly Rate ($)</Label>
                         <Input 
                           id="pay" 
                           type="number" 
                           step="0.01"
                           value={formData.payRate}
                           onChange={(e) => setFormData(prev => ({ ...prev, payRate: e.target.value }))}
                         />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pin">Access PIN (4 digits)</Label>
                      <Input 
                        id="pin" 
                        maxLength={4}
                        value={formData.pin}
                        onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Hourly Rate</TableHead>
                    <TableHead>PIN</TableHead>
                    <TableHead className="text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="pl-6 font-medium">{emp.name}</TableCell>
                      <TableCell className="capitalize">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          emp.role === 'manager' 
                            ? 'bg-primary/10 text-primary border-primary/20' 
                            : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {emp.role}
                        </span>
                      </TableCell>
                      <TableCell>${(emp.payRate / 100).toFixed(2)}/hr</TableCell>
                      <TableCell className="font-mono text-muted-foreground">****</TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </motion.div>
  );
}
