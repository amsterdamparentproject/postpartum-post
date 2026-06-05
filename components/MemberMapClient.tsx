"use client";

import dynamic from "next/dynamic";
import type { MemberLocation } from "@/app/admin/stats/actions";

const MemberMap = dynamic(() => import("@/components/MemberMap"), { ssr: false });

export default function MemberMapClient({ locations }: { locations: MemberLocation[] }) {
  return <MemberMap locations={locations} />;
}
