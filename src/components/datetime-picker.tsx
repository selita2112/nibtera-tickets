
'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from './ui/input';

interface DateTimePickerProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
}

export function DateTimePicker({ date, setDate }: DateTimePickerProps) {
  const [time, setTime] = React.useState({
    hours: date ? date.getHours() : 0,
    minutes: date ? date.getMinutes() : 0,
  });

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      setDate(undefined);
      return;
    }
    const newDate = new Date(selectedDate);
    newDate.setHours(time.hours, time.minutes);
    setDate(newDate);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newTime = { ...time, [name]: parseInt(value, 10) || 0 };
    setTime(newTime);
    if (date) {
        const newDate = new Date(date);
        newDate.setHours(newTime.hours, newTime.minutes);
        setDate(newDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP, hh:mm a') : <span>Pick a date and time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          initialFocus
        />
        <div className="p-3 border-t border-border">
          <p className="text-sm font-medium text-center mb-2">Time</p>
          <div className="flex items-center justify-center gap-2">
            <Input
              type="number"
              name="hours"
              value={String(time.hours).padStart(2, '0')}
              onChange={handleTimeChange}
              className="w-16"
              max={23}
              min={0}
            />
            :
            <Input
              type="number"
              name="minutes"
              value={String(time.minutes).padStart(2, '0')}
              onChange={handleTimeChange}
              className="w-16"
              max={59}
              min={0}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
