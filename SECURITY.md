# Security

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/kamilmielnik/gaddag/security/advisories/new). Please do not open a public issue for them.

## Scope

The only untrusted input this library is designed to handle is the byte stream given to `Gaddag.deserialize`. It checks the header, the alphabet, and the state boundaries with bounded work, and never allocates more than the input's size plus tables bounded by the UTF-16 code unit range. Everything else in the bytes is trusted until `validate` proves it — see [Garbage in, garbage out](https://github.com/kamilmielnik/gaddag#garbage-in-garbage-out) in the README. A report that crafted bytes can make `deserialize`, `validate`, `has`, `hasPrefix`, or `getArc` run unbounded or allocate unbounded memory is in scope.

The `Gaddag` constructor performs no validation by design and is out of scope.
