import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Trash2, GripVertical } from "lucide-react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStore, type Employee } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import type { ScheduleShift } from "../../../shared/schema";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const MIN_SHIFT_MINUTES = 30;

const EMPLOYEE_COLORS = [
  "bg-blue-500/80 border-blue-600 text-white",
  "bg-emerald-500/80 border-emerald-600 text-white",
  "bg-violet-500/80 border-violet-600 text-white",
  "bg-amber-500/80 border-amber-600 text-white",
  "bg-rose-500/80 border-rose-600 text-white",
  "bg-cyan-500/80 border-cyan-600 text-white",
  "bg-pink-500/80 border-pink-600 text-white",
  "bg-indigo-500/80 border-indigo-600 text-white",
  "bg-teal-500/80 border-teal-600 text-white",
  "bg-orange-500/80 border-orange-600 text-white",
];

function uid() {
  return `shift_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekStart(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT;
}

function pxToMinutes(px: number): number {
  return Math.round((px / HOUR_HEIGHT) * 60 / 15) * 15;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

type DragMode = "move" | "resize-top" | "resize-bottom" | null;

interface DragState {
  shiftId: string;
  mode: DragMode;
  startY: number;
  originalStartMinutes: number;
  originalEndMinutes: number;
  originalDay: number;
}

interface DropTarget {
  employeeId: string;
  dayOfWeek: number;
  startMinutes: number;
}

export default function SchedulePage() {
  const { employees } = useStore();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ day: number; employeeId: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const currentMonday = useMemo(() => {
    const now = new Date();
    const monday = getMonday(now);
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const weekStart = formatWeekStart(currentMonday);

  const weekDates = useMemo(() => {
    return DAYS.map((_, i) => {
      const d = new Date(currentMonday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentMonday]);

  const employeeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((e, i) => {
      map[e.id] = EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length];
    });
    return map;
  }, [employees]);

  const fetchShifts = useCallback(async (ws: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedule/shifts?weekStart=${ws}`);
      const data = await res.json();
      setShifts(data.shifts || []);
    } catch {
      toast({ title: "Error", description: "Failed to load schedule", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchShifts(weekStart);
  }, [weekStart, fetchShifts]);

  const createShift = useCallback(async (shift: Omit<ScheduleShift, "updatedAt" | "deletedAt">) => {
    try {
      const res = await fetch("/api/schedule/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shift),
      });
      const data = await res.json();
      if (data.shift) {
        setShifts(prev => [...prev, data.shift]);
      }
    } catch {
      toast({ title: "Error", description: "Failed to create shift", variant: "destructive" });
    }
  }, [toast]);

  const updateShift = useCallback(async (id: string, updates: Partial<ScheduleShift>) => {
    try {
      const res = await fetch(`/api/schedule/shifts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.shift) {
        setShifts(prev => prev.map(s => s.id === id ? data.shift : s));
      }
    } catch {
      toast({ title: "Error", description: "Failed to update shift", variant: "destructive" });
    }
  }, [toast]);

  const deleteShift = useCallback(async (id: string) => {
    try {
      await fetch(`/api/schedule/shifts/${id}`, { method: "DELETE" });
      setShifts(prev => prev.filter(s => s.id !== id));
      setSelectedShiftId(null);
    } catch {
      toast({ title: "Error", description: "Failed to delete shift", variant: "destructive" });
    }
  }, [toast]);

  const copyPreviousWeek = useCallback(async () => {
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const fromWeek = formatWeekStart(prevMonday);
    try {
      const res = await fetch("/api/schedule/copy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromWeek, toWeek: weekStart }),
      });
      const data = await res.json();
      if (data.shifts?.length) {
        setShifts(prev => [...prev, ...data.shifts]);
        toast({ title: "Copied", description: `${data.copied} shifts copied from previous week` });
      } else {
        toast({ title: "Nothing to copy", description: "Previous week has no shifts" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to copy schedule", variant: "destructive" });
    }
  }, [currentMonday, weekStart, toast]);

  const handleDrop = useCallback((e: React.DragEvent, dayOfWeek: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const employeeId = e.dataTransfer.getData("employeeId");
    if (!employeeId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = START_HOUR * 60 + pxToMinutes(y);
    const startMinutes = snapToGrid(Math.max(START_HOUR * 60, Math.min(rawMinutes, END_HOUR * 60 - 60)));
    const endMinutes = Math.min(startMinutes + 4 * 60, END_HOUR * 60);

    createShift({
      id: uid(),
      employeeId,
      weekStart,
      dayOfWeek,
      startMinutes,
      endMinutes,
    });
  }, [weekStart, createShift]);

  const handleDragOver = useCallback((e: React.DragEvent, dayOfWeek: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleShiftMouseDown = useCallback((e: React.MouseEvent, shiftId: string, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    setSelectedShiftId(shiftId);
    setDragState({
      shiftId,
      mode,
      startY: e.clientY,
      originalStartMinutes: shift.startMinutes,
      originalEndMinutes: shift.endMinutes,
      originalDay: shift.dayOfWeek,
    });
  }, [shifts]);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragState.startY;
      const deltaMinutes = pxToMinutes(deltaY);

      setShifts(prev => prev.map(s => {
        if (s.id !== dragState.shiftId) return s;
        if (dragState.mode === "move") {
          const newStart = snapToGrid(dragState.originalStartMinutes + deltaMinutes);
          const duration = dragState.originalEndMinutes - dragState.originalStartMinutes;
          const clampedStart = Math.max(START_HOUR * 60, Math.min(newStart, END_HOUR * 60 - duration));
          return { ...s, startMinutes: clampedStart, endMinutes: clampedStart + duration };
        } else if (dragState.mode === "resize-top") {
          const newStart = snapToGrid(dragState.originalStartMinutes + deltaMinutes);
          const clampedStart = Math.max(START_HOUR * 60, Math.min(newStart, dragState.originalEndMinutes - MIN_SHIFT_MINUTES));
          return { ...s, startMinutes: clampedStart };
        } else if (dragState.mode === "resize-bottom") {
          const newEnd = snapToGrid(dragState.originalEndMinutes + deltaMinutes);
          const clampedEnd = Math.min(END_HOUR * 60, Math.max(newEnd, dragState.originalStartMinutes + MIN_SHIFT_MINUTES));
          return { ...s, endMinutes: clampedEnd };
        }
        return s;
      }));
    };

    const handleMouseUp = () => {
      const shift = shifts.find(s => s.id === dragState.shiftId);
      if (shift) {
        updateShift(shift.id, {
          startMinutes: shift.startMinutes,
          endMinutes: shift.endMinutes,
          dayOfWeek: shift.dayOfWeek,
        });
      }
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, shifts, updateShift]);

  const weekLabel = useMemo(() => {
    const end = new Date(currentMonday);
    end.setDate(end.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${currentMonday.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}, ${end.getFullYear()}`;
  }, [currentMonday]);

  return (
    <AppShell title="Schedule">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => setWeekOffset(w => w - 1)}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center" data-testid="text-week-label">
              {weekLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => setWeekOffset(w => w + 1)}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => setWeekOffset(0)}
              data-testid="button-today"
            >
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={copyPreviousWeek}
              data-testid="button-copy-week"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy Previous Week
            </Button>
            {selectedShiftId && (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl"
                onClick={() => deleteShift(selectedShiftId)}
                data-testid="button-delete-shift"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Shift
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <Card className="p-3 w-48 shrink-0 self-start">
            <h3 className="font-medium text-sm mb-2 text-muted-foreground">Employees</h3>
            <div className="space-y-1">
              {employees.map(emp => (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("employeeId", emp.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing border transition-colors hover:bg-accent ${employeeColorMap[emp.id]?.split(" ").slice(0, 1).join(" ").replace("/80", "/10")} border-transparent hover:border-border`}
                  data-testid={`drag-employee-${emp.id}`}
                >
                  <GripVertical className="h-3.5 w-3.5 opacity-40" />
                  <div className={`w-2.5 h-2.5 rounded-full ${employeeColorMap[emp.id]?.split(" ")[0]}`} />
                  <span className="text-sm font-medium truncate text-foreground">{emp.name}</span>
                </div>
              ))}
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No employees yet</p>
              )}
            </div>
          </Card>

          <Card className="flex-1 overflow-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 bg-card z-10">
                <div className="p-2" />
                {DAYS.map((day, i) => (
                  <div key={day} className="p-2 text-center border-l">
                    <div className="text-xs font-medium text-muted-foreground">{day}</div>
                    <div className="text-sm font-semibold" data-testid={`text-day-${i}`}>
                      {weekDates[i].getDate()}
                    </div>
                  </div>
                ))}
              </div>

              <div ref={gridRef} className="grid grid-cols-[60px_repeat(7,1fr)] relative select-none">
                <div className="relative">
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="border-b text-[10px] text-muted-foreground pr-1 text-right"
                      style={{ height: HOUR_HEIGHT }}
                    >
                      {formatTime((START_HOUR + i) * 60)}
                    </div>
                  ))}
                </div>

                {DAYS.map((_, dayIdx) => (
                  <div
                    key={dayIdx}
                    className="relative border-l"
                    style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
                    onDrop={(e) => handleDrop(e, dayIdx)}
                    onDragOver={(e) => handleDragOver(e, dayIdx)}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-shift]")) return;
                      setSelectedShiftId(null);
                    }}
                    data-testid={`drop-zone-${dayIdx}`}
                  >
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="border-b border-dashed border-muted/40"
                        style={{ height: HOUR_HEIGHT }}
                      />
                    ))}

                    {shifts
                      .filter(s => s.dayOfWeek === dayIdx)
                      .map(shift => {
                        const emp = employees.find(e => e.id === shift.employeeId);
                        const top = minutesToPx(shift.startMinutes - START_HOUR * 60);
                        const height = minutesToPx(shift.endMinutes - shift.startMinutes);
                        const isSelected = selectedShiftId === shift.id;
                        const colorClass = employeeColorMap[shift.employeeId] || EMPLOYEE_COLORS[0];

                        return (
                          <div
                            key={shift.id}
                            data-shift
                            data-testid={`shift-block-${shift.id}`}
                            className={`absolute left-1 right-1 rounded-lg border-2 transition-shadow cursor-pointer overflow-hidden ${colorClass} ${isSelected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : "shadow-sm hover:shadow-md"}`}
                            style={{ top, height, minHeight: 20, zIndex: isSelected ? 20 : 10 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedShiftId(shift.id);
                            }}
                          >
                            <div
                              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/30 rounded-t-lg"
                              onMouseDown={(e) => handleShiftMouseDown(e, shift.id, "resize-top")}
                              data-testid={`resize-top-${shift.id}`}
                            />

                            <div
                              className="flex-1 px-1.5 py-1 overflow-hidden"
                              onMouseDown={(e) => handleShiftMouseDown(e, shift.id, "move")}
                              style={{ cursor: dragState?.shiftId === shift.id ? "grabbing" : "grab" }}
                            >
                              <div className="text-xs font-semibold truncate leading-tight">
                                {emp?.name || "Unknown"}
                              </div>
                              {height > 30 && (
                                <div className="text-[10px] opacity-80 leading-tight">
                                  {formatTime(shift.startMinutes)} - {formatTime(shift.endMinutes)}
                                </div>
                              )}
                              {height > 50 && (
                                <div className="text-[10px] opacity-70 leading-tight">
                                  {((shift.endMinutes - shift.startMinutes) / 60).toFixed(1)}h
                                </div>
                              )}
                            </div>

                            <div
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/30 rounded-b-lg"
                              onMouseDown={(e) => handleShiftMouseDown(e, shift.id, "resize-bottom")}
                              data-testid={`resize-bottom-${shift.id}`}
                            />
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
