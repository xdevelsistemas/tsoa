#!/usr/bin/env node
/* tslint:disable:no-console */
import { Config, SwaggerConfig, RoutesConfig } from './config';
import { MetadataGenerator } from './metadataGeneration/metadataGenerator';
import { SpecGenerator } from './swagger/specGenerator';
import { RouteGenerator } from './routeGeneration/routeGenerator';
import * as yargs from 'yargs';

const appRoot: string = require('app-root-path').path;

const getPackageJsonValue = (key: string): string => {
  try {
    const packageJson = require(`${appRoot}/package.json`);
    return packageJson[key] || '';
  } catch (err) {
    return '';
  }
};

const versionDefault = getPackageJsonValue('version');
const nameDefault = getPackageJsonValue('name');
const descriptionDefault = getPackageJsonValue('description');
const licenseDefault = getPackageJsonValue('license');

const getConfig = (configPath = 'tsoa.json'): Config => {
  let config: Config;
  try {
    config = require(`${appRoot}/${configPath}`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw Error(`No config file found at '${configPath}'`);
    } else if (err.name === 'SyntaxError') {
      throw Error(`Invalid JSON syntax in config at '${configPath}': ${err.message}`);
    } else {
      throw Error(`Unhandled error encountered loading '${configPath}': ${err.message}`);
    }
  }

  return config;
};

const validateSwaggerConfig = (config: SwaggerConfig): SwaggerConfig => {
  if (!config.outputDirectory) { throw new Error('Missing outputDirectory: onfiguration most contain output directory'); }
  if (!config.entryFile) { throw new Error('Missing entryFile: Configuration must contain an entry point file.'); }
  config.version = config.version || versionDefault;
  config.name = config.name || nameDefault;
  config.description = config.description || descriptionDefault;
  config.license = config.license || licenseDefault;
  config.basePath = config.basePath || '/';

  return config;
};

const validateRoutesConfig = (config: RoutesConfig): RoutesConfig => {
  if (!config.entryFile) { throw new Error('Missing entryFile: Configuration must contain an entry point file.'); }
  if (!config.routesDir) { throw new Error('Missing routesDir: Configuration must contain a routes file output directory.'); }
  config.basePath = config.basePath || '/';
  config.middleware = config.middleware || 'express';

  return config;
};

const configuration = {
  alias: 'c',
  describe: 'tsoa configuration file; default is tsoa.json in the working directory',
  required: false,
  type: 'string'
};

yargs
  .usage('Usage: $0 <command> [options]')
  .demand(1)

  .command('swagger', 'Generate swagger spec', {
    configuration
  }, (args: CommandLineArgs) => {
    try {
      const config = getConfig(args.configuration);
      const swaggerConfig = validateSwaggerConfig(config.swagger);

      const metadata = new MetadataGenerator(swaggerConfig.entryFile).Generate();
      new SpecGenerator(metadata, config.swagger).GenerateJson(swaggerConfig.outputDirectory);
    } catch (err) {
      console.error(err);
    }
  })

  .command('routes', 'Generate routes', {
    configuration
  }, (args: CommandLineArgs) => {
    try {
      const config = getConfig(args.configuration);
      const routesConfig = validateRoutesConfig(config.routes);

      const metadata = new MetadataGenerator(routesConfig.entryFile).Generate();
      const routeGenerator = new RouteGenerator(metadata, routesConfig);

      switch (routesConfig.middleware) {
        case 'express':
          routeGenerator.GenerateExpressRoutes();
          break;
        case 'hapi':
          routeGenerator.GenerateHapiRoutes();
          break;
        case 'koa':
          routeGenerator.GenerateKoaRoutes();
          break;
        default:
          routeGenerator.GenerateExpressRoutes();
      }
    } catch (err) {
      console.error(err);
    }
  })

  .help('help')
  .alias('help', 'h')
  .argv;

interface CommandLineArgs extends yargs.Argv {
  configuration: string;
}
