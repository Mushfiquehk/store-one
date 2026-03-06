import {
  Users,
  Plus,
  Search,
  MoreVertical,
  ShieldCheck,
  UserCog,
  Trash2,
  Lock
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStore, type Employee } from "@/lib/store";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function EmployeesPage() {
  const { employees, addEmployee, updateEmployee } = useStore();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [formData, setFormData] = useState<Partial<Employee>>({
    name: "",
    role: "staff",
    payRate: 0,
    pin: ""
  });

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDialog = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({ ...employee });
    } else {
      setEditingEmployee(null);
      setFormData({ name: "", role: "staff", payRate: 1500, pin: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.pin) {
      toast({ title: "Error", description: "Name and PIN are required.", variant: "destructive" });
      return;
    }

    if (editingEmployee) {
      updateEmployee(editingEmployee.id, formData);
      toast({ title: "Success", description: "Employee updated successfully." });
    } else {
      addEmployee({
        id: uid("emp"),
        name: formData.name!,
        role: formData.role || "staff",
        payRate: formData.payRate || 0,
        pin: formData.pin!
      });
      toast({ title: "Success", description: "New employee added." });
    }
    setIsDialogOpen(false);
  };

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AppShell title="Employees">
        <div className="flex flex-col gap-6">
          <header className="rounded-3xl border bg-card shadow-soft p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-serif">Staff Management</h2>
                <p className="text-muted-foreground text-sm">Manage your team, roles, and access PINs.</p>
              </div>
              <Button onClick={() => handleOpenDialog()} className="rounded-xl shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            </div>
          </header>

          <Card className="shadow-soft rounded-2xl overflow-hidden border-none">
            <div className="p-4 border-b bg-muted/20 flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="pl-9 bg-background rounded-xl border-none shadow-sm focus-visible:ring-1"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">PIN</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map(employee => (
                    <TableRow key={employee.id} className="group cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {employee.name.slice(0, 2).toUpperCase()}
                          </div>
                          {employee.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${employee.role === 'manager'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {employee.role === 'manager' && <ShieldCheck className="w-3 h-3 mr-1" />}
                          {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted/50 text-xs font-mono text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          ***{employee.pin.slice(-1)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl p-1">
                            <DropdownMenuItem onClick={() => handleOpenDialog(employee)} className="rounded-lg cursor-pointer">
                              <UserCog className="mr-2 h-4 w-4" /> Edit Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No employees found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
              <DialogDescription>Set up access and payroll details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="col-span-3" placeholder="Jane Doe" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="role" className="text-right">Role</Label>
                <Select value={formData.role} onValueChange={(val: string) => setFormData({...formData, role: val})}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pin" className="text-right">Access PIN</Label>
                <Input
                  id="pin"
                  value={formData.pin}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setFormData({...formData, pin: val});
                  }}
                  className="col-span-3 font-mono tracking-widest"
                  placeholder="0000"
                  maxLength={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" onClick={handleSave}>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </motion.div>
  );
}
