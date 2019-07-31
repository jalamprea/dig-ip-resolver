'use strict';

const environment = process.env.NODE_ENV || 'development';
const dig = require('node-dig-dns');
const defaults = {
  useCookie: false,
  useTCP: false
};

module.exports.resolveDNS = function(hostname, options) {
  return new Promise((resolve, reject) => {

    let lastDigCommand = null;

    if(!options) {
      options = defaults;
    } else {
      options = Object.assign(defaults, options);
    }

    let nsRecords = [];
    let ip = null;

    const resolveIP = async function(result) {
      //console.log(' - Resolved IP', result);

      if (result && result.answer) {
        if (result.answer[0].type==='CNAME') {
          //console.log('IP found as CNAME, resolving again from ', result.answer[0].value);
          return module.exports.resolveDNS(result.answer[0].value).then(resolve).catch(reject);
        }

        // if it is not a cname, it will be a A record with a valid IP:
        ip = result.answer[0].value;
      }
      
      // var ns = (result.authority) ? result.authority[0][result.authority[0].length-1] : null;
      if(ip===null) {
        if(result.authority && result.authority[0] && result.authority[0][result.authority[0].length-1]){
          console.log('Delegate nameserver found...', hostname, result.authority[0][result.authority[0].length-1]);
          return dig(['@'+result.authority[0][result.authority[0].length-1], 'A', hostname, '+nocookie']).then(resolveIP);
        }        
        console.log('IP not found, resolving again ns...', hostname, nsRecords[1]);
        lastDigCommand = ['@'+nsRecords[1], 'A', hostname, '+time=2', '+tries=1', '+tcp', '+nocookie'];
        let res = (await dig(lastDigCommand).catch((err) => {
          console.log("Both nameservers fail to resolve IP", hostname, nsRecords[0], nsRecords[1]);
        }));
        //console.log(res);
        ip = res.answer[0].value;
      }

      const res = {
        ip: ip,
        ns: nsRecords
      };
      // console.log(' - DNS resolved!!', res);
      resolve(res);
    };

    const resolveNS = function(result_ns2) {
      if(!result_ns2 || !result_ns2.authority || result_ns2.authority.length<1) {
        // console.log('DIG not valid:', result_ns2);
        let cmd = lastDigCommand.join(' ');
        return reject('Domain not valid to get response: ' + hostname + " \n DIG " + cmd);
      }

      // console.log(' - Resolved NS...', result_ns2);
      // this part: result_ns2.authority  -  could be undefined on strange subdomains!!
      var record = '', ns = '';
      nsRecords = []; // force empty array
      for (var i = result_ns2.authority.length - 1; i >= 0; i--) {
        record = result_ns2.authority[i];
        if(record[3]!=='NS') {
          let cmd = lastDigCommand.join(' ');
           console.error('Domain Error', result_ns2, ' - DIG', cmd);
          reject('Invalid NS record: dig ' + cmd + ' ==> ' + JSON.stringify(record));
          return false;
        }
        ns = record[record.length-1];
        nsRecords.unshift(ns);
      }

      ns = nsRecords[0]; // TODO: this should be based on the NS priority...
      
      try {
        lastDigCommand = ['A', hostname, '@' + ns, '+time=2', '+tries=1'];
        if (options.useCookie) {
            lastDigCommand.push('+nocookie');
        }
        if (options.useTCP) {
          lastDigCommand.push('+tcp');
        }
        dig(lastDigCommand).then(resolveIP).catch((err) => {
          console.log('retrying with second nameserver. RESOLVE ERROR:', lastDigCommand, err);
          lastDigCommand[2] = '@' + nsRecords[1];//retry with second nameserver
          dig(lastDigCommand).then(resolveIP).catch((err) => {
            console.log('RESOLVE ERROR:', lastDigCommand, err);
            reject(err);
          });
        });
      } catch(ex) {
        console.error('DIG Error:', ex.toString(), lastDigCommand);
        reject(ex);
      }
    };

    const resolveTLD = function(result_ns1) {
      //console.log(hostname, result_ns1);
      if (result_ns1.authority) {
        var ln = result_ns1.authority[0].length-1;
        var ns2 = result_ns1.authority[0][ln];

        // console.log('TLD: dig @'+ns2+' ns ' + hostname);
        lastDigCommand = ['@'+ns2, 'NS', hostname, '+time=2', '+tries=1'];
        if (options.useTCP) {
          lastDigCommand.push('+tcp');
        }
        if (options.useCookie) {
           lastDigCommand.push('+nocookie');
        }
        //console.log(lastDigCommand);
        dig(lastDigCommand).then(results => {
          if(results.header && results.header) {
            let rs = results.header;
            let stringRes = rs[rs.length-1][0];
            // first check if we get timeout, so we can try with a different NS record...
            //console.log(lastDigCommand, stringRes);
            if (stringRes && stringRes.indexOf('connection timed out')>=0) {
              ns2 = result_ns1.authority[ result_ns1.authority.length-1 ][ln];

              lastDigCommand = ['@'+ns2, 'NS', hostname, '+time=2', '+tries=1', '+tcp', '+nocookie'];
              return dig(lastDigCommand).then(resolveNS).catch(reject);
            }
          }
          resolveNS(results);
        }).catch(err => {
          console.error(lastDigCommand, ' :: ', err);
          let cmd = lastDigCommand.join(' ');
          reject('DIG ' + cmd + ' -> ERROR: TLD invalid');
        })
      } else {
        reject('not-domain');
      }
    };
    
    // console.log("\nROOT: "+'dig @a.root-servers.net ns ' + hostname);
    lastDigCommand = ['@a.root-servers.net', 'NS', hostname, '+time=2', '+tries=1'];
    if (options.useTCP) {
      lastDigCommand.push('+tcp');
    }
    if (options.useCookie) {
       lastDigCommand.push('+nocookie');
    }
    dig(lastDigCommand).then(resolveTLD).catch((err) => {
      console.error('RESOLVE ERROR:', err);
      if (err.messsage) {
        err.messsage = 'DIG '+lastDigCommand.join(' ') + err.messsage;
      }
      reject(err);
    });
  });
}