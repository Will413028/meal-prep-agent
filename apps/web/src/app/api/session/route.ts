import { handlePersistence } from "../../../server/persistence/oracle-http";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=handlePersistence;
export const DELETE=handlePersistence;
