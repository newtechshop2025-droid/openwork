"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PermissionModeOption = {
  value: string;
  label: string;
};

type PermissionModeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const OPTIONS: PermissionModeOption[] = [
  { value: "default", label: "Default" },
  { value: "bypass", label: "Bypass permission" },
  { value: "accept_edits", label: "Accept Edits" },
  { value: "plan", label: "Plan" },
  { value: "auto", label: "Auto" },
];

export function PermissionModeSelect({
  value,
  onChange,
  disabled = false,
}: PermissionModeSelectProps) {
  const currentOption = OPTIONS.find((opt) => opt.value === value) ?? OPTIONS[0];

  return (
    <Select
      value={currentOption.value}
      items={OPTIONS}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue);
        }
      }}
      disabled={disabled}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SelectTrigger
              size="sm"
              disabled={disabled}
              aria-label="Permission Mode"
              className="h-10 border-0 bg-transparent px-2.5 py-1 text-sm rounded-md text-gray-10 shadow-none hover:bg-gray-3 hover:text-gray-12 data-[size=sm]:h-8"
            />
          }
        >
          <SelectValue placeholder="Default" />
        </TooltipTrigger>
        <TooltipContent>Permission Mode</TooltipContent>
      </Tooltip>
      <SelectContent side="top" sideOffset={8} align="start" className="min-w-48">
        <SelectGroup>
          <SelectLabel>Permission Mode</SelectLabel>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
