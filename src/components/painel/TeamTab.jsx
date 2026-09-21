import React from "react";
import UsersTab from "@/components/painel/UsersTab";

export default function TeamTab({ users = [], user, onChanged }) {
  return <UsersTab users={users} user={user} onChanged={onChanged} mode="team" />;
}
