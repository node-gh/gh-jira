/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Author <email@email.com>
 */

// -- Requires -----------------------------------------------------------------
var assert = require('assert'),
    boilerplate = require('../bin/boilerplate');

// -- Suites -------------------------------------------------------------------
describe('A test suite', function() {
    it('should return a hello world message', function(){
        var foo = boilerplate.foo();
        assert.equal('NodeGH plugin boilerplate :)', foo);
    });
});