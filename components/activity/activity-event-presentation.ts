import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Check,
  CircleHelp,
  CloudCog,
  Code2,
  MonitorCog,
  SearchCheck,
  UserCheck,
} from "lucide-react";
import type { ActivityActor, ActivityEvent, ActivityEventType } from "@/lib/api-types";

export type ActivityTone = "neutral" | "progress" | "success" | "warning";

export interface ActorPresentation {
  label: string;
  icon: LucideIcon;
  tone: ActivityTone;
}

export interface EventPresentation {
  title: string;
  tone: ActivityTone;
}

const actorPresentations: Record<string, ActorPresentation> = {
  HUMAN: { label: "Human approval", icon: UserCheck, tone: "warning" },
  MANAGER: { label: "Manager", icon: Bot, tone: "progress" },
  FULL_STACK_DEVELOPER: { label: "Full Stack Developer", icon: Code2, tone: "progress" },
  DEVOPS_ENGINEER: { label: "DevOps Engineer", icon: CloudCog, tone: "success" },
  REVIEWER: { label: "Reviewer", icon: SearchCheck, tone: "success" },
  SYSTEM: { label: "System", icon: MonitorCog, tone: "neutral" },
};

const eventPresentations: Record<ActivityEventType, EventPresentation> = {
  PROJECT_CREATED: { title: "Project connected", tone: "success" },
  TASK_CREATED: { title: "Task created", tone: "neutral" },
  PLAN_CREATED: { title: "Manager plan created", tone: "progress" },
  PLAN_APPROVED: { title: "Plan approved", tone: "success" },
  PLAN_REJECTED: { title: "Plan rejected", tone: "warning" },
  IMPLEMENTATION_COMPLETED: { title: "Implementation completed", tone: "success" },
  VALIDATION_COMPLETED: { title: "Validation completed", tone: "success" },
  REVIEW_COMPLETED: { title: "Review completed", tone: "success" },
  BROWSER_VERIFICATION_COMPLETED: { title: "Browser verification completed", tone: "success" },
  SCREENSHOT_CAPTURED: { title: "Frontend screenshot captured", tone: "success" },
  VISUAL_REVIEW_COMPLETED: { title: "Visual review completed", tone: "success" },
  PULL_REQUEST_CREATED: { title: "Pull request created", tone: "success" },
};

export function presentActor(actor: ActivityActor): ActorPresentation {
  const key = actor.kind === "AGENT" ? actor.role : actor.kind;
  return actorPresentations[key] ?? {
    label: "Unknown actor",
    icon: CircleHelp,
    tone: "neutral",
  };
}

export function presentEventType(type: ActivityEvent["type"] | string): EventPresentation {
  return eventPresentations[type as ActivityEventType] ?? {
    title: readableUnknownType(type),
    tone: "neutral",
  };
}

export function formatActivityTimestamp(value: string): { label: string; dateTime?: string } {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return { label: "Timestamp unavailable" };
  }

  return {
    label: new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date),
    dateTime: value,
  };
}

function readableUnknownType(type: string): string {
  const readable = type
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return readable ? `Event: ${readable.toLowerCase()}` : "Unknown event";
}

export const activityToneIcons: Record<ActivityTone, LucideIcon> = {
  neutral: CircleHelp,
  progress: Bot,
  success: Check,
  warning: UserCheck,
};

export function eventIconForTone(tone: ActivityTone): LucideIcon {
  return activityToneIcons[tone];
}
