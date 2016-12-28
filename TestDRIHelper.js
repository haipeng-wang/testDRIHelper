var fs      = require('fs')
  ,xml2js   = require('xml2js')
  ,parser   = new xml2js.Parser()
  ,_        = require('underscore')
  ,js2xml   = require('js2xmlparser')
  ,minimist = require('minimist')
  ;

var args = minimist(process.argv.slice(2), {
  string: ['trx', 'playlist', 'csv']
});

var path = args.trx;

if (_.isEmpty(args.trx)) {
  console.error('Have to pass trx path, need to read trx to parse');
  return;
}

if (_.isEmpty(args.playlist)) {
  console.warn('you have not passed arg --playlist, so will not output playlist file');
}

if (_.isEmpty(args.csv)) {
  console.warn('you have not passed arg --csv, so will not output csv file');
}

var data = fs.readFileSync(args.trx, 'utf-8');

parser.parseString(data.replace('\ufeff', ''), function(err, result) {
  processResult(result);
});

function processResult(result) {
  var testDefinitions = getTestDefinitions(_.chain(result).result('TestRun').result('TestDefinitions').first().value());
  var failedCases = getFailedCases(_.chain(result).result('TestRun').result('Results').first().value());

  if (!_.isEmpty(args.playlist)) {
    writeSeleniumPlayList(failedCases, testDefinitions, args.playlist);
  }

  if (!_.isEmpty(args.csv)) {
    writeFailedCaseCSV(failedCases, args.csv);
  }
}

function getTestDefinitions(results) {
  var ret = {};

  _.each(results['UnitTest'], function(value, key) {
    var testId = value['$']['id'];

    if (_.isEmpty(testId)) {
      return;
    }

    ret[testId] = _.chain(value).result('TestMethod').first().result('$').value();
  });

  return ret;
}

function getFailedCases(results) {
  var ret = {};

  _.each(results['UnitTestResult'], function(value, key) {
    var testId = value['$']['testId'];
    var testResult = value['$']['outcome'] === 'Passed' ? 0 : 1;
    var error = _.chain(value)
                .result('Output')
                .first()
                .result('ErrorInfo')
                .value();

    if(_.isUndefined(ret[testId])) {
      ret[testId] = {
        'result': testResult,
        'name': value['$']['testName'],
        'errors': []
      };
    } else {
      ret[testId]['result'] &= testResult;
    }

    if (!_.isEmpty(error)) {
      ret[testId]['errors'].push(error);
    }
  });

  //_.omit not work here
  var failedList = [];
  _.each(ret, function(value, key) {
    if (value.result === 1) {
      failedList.push(key);
    }
  });

  return _.pick(ret, failedList);
}

function writeSeleniumPlayList(failedCases, testDefinitions, outfile) {
  var jsCont = {
    '@': {
      'Version': '1.0'
    },
    Add: _.chain(testDefinitions)
                  .pick(_.keys(failedCases))
                  .values()
                  .map(function(item) {
                    return {
                      '@': {
                        Test: item.className + '.' + item.name
                      }
                    };
                  })
                  .value()
  };

  fs.writeFileSync(outfile, js2xml('Playlist', jsCont));

}

function writeFailedCaseCSV(failedCases, outfile) {
  //write csv file
  //the foramt is testName, error1, cause1
  //                      , error2, cause2
  var wrap = '\n';
  var buffer = 'Test case,Error,Cause' + wrap;
  var cause = ',' + wrap;
  _.each(failedCases, function(val, key) {
    var name = val.name + ',';
    // todo: write errors here, need a better way to originize error
    // if (!_.isEmpty(val.errors)) {
    //   _.each(val.errors, function(error) {
    //     buffer += name + '"' + error + '"';
    //     buffer + cause;
    //   });
    //   return;
    // }
    buffer += name + cause;
  });
  fs.writeFileSync(outfile, buffer);
}