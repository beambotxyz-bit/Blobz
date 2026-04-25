#!/bin/bash
if pwd | grep -qw "src"; then
    node --expose-gc index.js
else
    echo "You must run the Blobz server from the src folder!"
fi
