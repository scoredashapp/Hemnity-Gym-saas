import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Keyboard,
  PauseCircle,
  QrCode,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { DisplayMemberStatus, PaymentStatus } from '../utils/gymRules';

export function MemberStatusLabel({
  status,
  daysLeft,
}: {
  status: DisplayMemberStatus;
  daysLeft?: number | null;
}) {
  if (status === 'Inactive') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 whitespace-nowrap shrink-0">
        <PauseCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Inactive</span>
      </span>
    );
  }
  if (status === 'Expired') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap shrink-0">
        <AlertOctagon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Expired</span>
      </span>
    );
  }
  if (status === 'ExpiringSoon') {
    const label =
      daysLeft === 0
        ? 'Expires today'
        : typeof daysLeft === 'number'
          ? `${daysLeft}d left`
          : 'Expiring soon';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 whitespace-nowrap shrink-0">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Active</span>
    </span>
  );
}

export function PaymentStatusLabel({ status }: { status: PaymentStatus | 'Refunded' }) {
  if (status === 'Paid') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Paid</span>
      </span>
    );
  }
  if (status === 'Partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Partial</span>
      </span>
    );
  }
  if (status === 'Refunded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 whitespace-nowrap shrink-0">
        <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Refunded</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap shrink-0">
      <AlertOctagon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Pending</span>
    </span>
  );
}

export function StatusIndicator({ status }: { status: string }) {
  const normalized = status.trim();

  if (normalized === 'Active' || normalized === 'Paid' || normalized === 'Resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (
    normalized === 'Trial' ||
    normalized === 'Grace' ||
    normalized === 'Partial' ||
    normalized === 'ExpiringSoon' ||
    normalized === 'In Progress' ||
    normalized === 'Pending'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized === 'ExpiringSoon' ? 'Expiring soon' : normalized}</span>
      </span>
    );
  }

  if (normalized === 'Suspended' || normalized === 'Expired' || normalized === 'Failed' || normalized === 'Open') {
    const Icon = normalized === 'Failed' ? XCircle : normalized === 'Open' ? AlertTriangle : AlertOctagon;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap shrink-0">
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (normalized === 'Refunded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 whitespace-nowrap shrink-0">
        <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Refunded</span>
      </span>
    );
  }

  if (normalized === 'QR') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 whitespace-nowrap shrink-0">
        <QrCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>QR Scan</span>
      </span>
    );
  }

  if (normalized === 'Keyboard') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 whitespace-nowrap shrink-0">
        <Keyboard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Keyboard ID</span>
      </span>
    );
  }

  if (normalized === 'Manual') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 whitespace-nowrap shrink-0">
        <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Desk Manual</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 whitespace-nowrap shrink-0">
      <PauseCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{normalized || 'Inactive'}</span>
    </span>
  );
}
