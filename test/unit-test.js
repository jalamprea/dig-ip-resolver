'use strict';
const fs      = require('fs');
const expect  = require('chai').expect,
    dig_res   = require('../');


describe('dig_res.resolveDNS(hostname)', function () {
  this.timeout(1000);
  it('Should resolve a real IP address from a hostname', async function () {
    
    try {
        const hostname = 'www.wikipedia.org';
        const res = await dig_res.resolveDNS(hostname);

        expect(res).to.be.an.instanceof(Object);
        expect(res).to.have.property('ip');
    
        console.log('Resolve:', res);
    } catch (ex) {
        console.error(ex);
        expect.fail(ex);
    }
    
  });
});
