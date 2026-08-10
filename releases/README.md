# Historical releases

This directory retains every versioned userscript artifact.

~~~text
releases/
├── v0.4/
│   └── 银河奶牛公会信用点性价比-v0.4.35.user.js
├── v1.0/
│   └── 银河奶牛公会信用点性价比-v1.0.0.user.js
└── v1.1/
    └── 银河奶牛公会信用点性价比-v1.1.43.user.js
~~~

The directory name identifies the major/minor release series; the filename
contains the complete semantic version.

manifest.json lists every release in semantic-version order with its path,
byte size, and SHA-256 digest.

These files are immutable release records. Normal builds update only dist/.
The guarded release command may create one new archive, but it will fail if the
same version already exists with different contents.
