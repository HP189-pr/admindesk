import React from "react";
import InstitutionalVerification from "./Inst-Verification";

// Thin wrapper so the module always has a concrete default export
const InstLetter = (props) => <InstitutionalVerification {...props} />;

export default InstLetter;
export { InstLetter };
