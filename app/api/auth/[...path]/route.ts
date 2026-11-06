import {auth} from "@/lib/pro-auth/server";
// Managed Neon Auth handles credential verification, session rotation and cookies.
export const {GET,POST}=auth.handler();
export const dynamic="force-dynamic";
