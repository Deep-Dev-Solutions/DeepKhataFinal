import Link from "next/link";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RecentOrdersTableProps = {
  orders?: Array<{
    orderNumber?: number;
    customerName?: string;
    totalAmount?: number;
    paymentStatus?: string;
    relativeTime?: string;
  }>;
};

const paymentVariant: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "danger",
  PENDING: "neutral",
};

export default function RecentOrdersTable({
  orders = [],
}: RecentOrdersTableProps) {
  const paymentIcon: Record<
    string,
    React.ComponentType<{ className?: string }>
  > = {
    PAID: CheckCircle2,
    PARTIAL: Clock,
    UNPAID: AlertCircle,
    PENDING: Clock,
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border pb-3">
        <CardTitle>Recent Activity</CardTitle>
        <Link
          href="/orders"
          className="text-caption font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline"
        >
          View All Orders
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        <Table containerClassName="rounded-none border-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableEmpty colSpan={5}>No recent orders yet.</TableEmpty>
            ) : (
              orders.map((order, index) => {
                const status = order.paymentStatus || "PENDING";
                const Icon = paymentIcon[status] || Clock;

                return (
                  <TableRow key={`${order.orderNumber || index}`}>
                    <TableCell className="font-semibold text-brand-700">
                      #ORD-{order.orderNumber || index + 1}
                    </TableCell>
                    <TableCell className="font-medium text-gray-900">
                      {order.customerName || "Walk-in Customer"}
                    </TableCell>
                    <TableCell className="font-medium">
                      Rs. {Number(order.totalAmount || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentVariant[status] || "neutral"} uppercase>
                        <Icon className="h-3 w-3" /> {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-500">
                      {order.relativeTime || "Recently"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
