[![Codeship Status for lukeautry/tsoa](https://codeship.com/projects/cdce38d0-1f6b-0134-258e-1ed679ae6c9d/status?branch=master)](https://codeship.com/projects/160322)
[![npm version](https://badge.fury.io/js/tsoa.svg)](https://badge.fury.io/js/tsoa)

## Goal

- TypeScript controllers and models as the single source of truth for your API
- A valid swagger spec is generated from your controllers and models, including:
    - Paths (e.g. GET /Users)
    - Definitions based on TypeScript interfaces (models)
    - Parameters/model properties marked as required or optional based on TypeScript (e.g. myProperty?: string is optional in the Swagger spec)
    - jsDoc supported for object descriptions (most other metadata can be inferred from TypeScript types)
- Routes are generated for middleware of choice
    - Express, Hapi, and Koa currently supported, other middleware can be supported using a simple handlebars template
    - Validate request payloads

## Philosophy

- Rely on TypeScript type annotations to generate API metadata if possible
- If regular type annotations aren't an appropriate way to express metadata, use decorators
- Use jsdoc for pure text metadata (e.g. endpoint descriptions)
- Minimize boilerplate
- Models are best represented by interfaces (pure data structures), but can also be represented by classes

## How it works

### Create Controllers

```typescript
// controllers/usersController.ts

import {Get, Route} from 'tsoa';
import {UserService} from '../services/userService';
import {User, UserCreationRequest} from '../models/user';

@Route('Users')
export class UsersController {
    @Get('{id}')
    public async getUser(id: number): Promise<User> {
        return await new UserService().get(id);
    }

    @Post()
    public async createUser(request: UserCreationRequest): Promise<User> {
        return await new UserService().create(request);
    }
}
```
### Create Models
```typescript
// models/user.ts

export interface User {
    id: number;
    email: string;
    name: Name;
    status?: status;
    phoneNumbers: string[];
}

export type status = 'Happy' | 'Sad';

export interface Name {
    first: string;
    last?: string;
}

export interface UserCreationRequest {
    email: string;
    name: Name;
    phoneNumbers: string[];
}
```

Note that type aliases are only supported for string literal types like `type status = 'Happy' | 'Sad'`

### Generate

From command line/npm script:
```
// generate swagger.json
tsoa swagger

// generate routes
tsoa routes
```

See [CLI documentation](#command-line-interface)

### Consume generated routes

```typescript
import * as methodOverride from 'method-override';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import {RegisterRoutes} from './routes';

// controllers need to be referenced in order to get crawled by the generator
import './controllers/usersController';

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

RegisterRoutes(app);

app.listen(3000);

```

### Get access to the request object of express in Controllers

To access the request object of express in a controller method use the `@Request`-decorator:
```typescript
// controllers/usersController.ts

import * as express from 'express';
import {Get, Route, Request} from 'tsoa';
import {User, UserCreationRequest} from '../models/user';

@Route('Users')
export class UsersController {
    @Get('{id}')
    public async getUser(id: number, @Request() request: express.Request): Promise<User> {
        // TODO: implement some code that uses request as well
    }
}
```
Note that the parameter `request` does not appear in your swagger definition file. 
Likewise you can use the decorator `@Inject` to mark a parameter as being injected manually and should be omitted in swagger generation.
In this case you should write your own custom template where you inject the needed objects/values in the method-call. 

### Dependency injection / IOC

By default all the controllers are created by the auto-generated routes template using an empty default constructor.
If you want to use dependency injection and let the DI-framework handle the creation of your controllers you can use [inversifyJS](https://github.com/inversify/InversifyJS).
To tell `tsoa` to use your DI-container you have to reference your module exporting the DI-container in the config file (e.g. `tsoa.json`):
The convention is that you have to name your inversify `Container` `iocContainer` and export it in the given module.
```json
{
  "swagger": {
    ...
  },
  "routes": {
    "entryFile": "...",
    "routesDir": "...",
    "middleware": "...",
    "iocModule": "./inversify/ioc",
    ...
  }
}
```
Note that the path is relative to the `routesDir` and does not contain the extension.

Here is some example code how to setup the container and your controller.

`./inversify/ioc.ts`:
```ts
import { Container, inject, interfaces } from 'inversify';
import { autoProvide, makeProvideDecorator, makeFluentProvideDecorator } from 'inversify-binding-decorators';

let iocContainer = new Container();

let provide = makeProvideDecorator(iocContainer);
let fluentProvider = makeFluentProvideDecorator(iocContainer);

let provideNamed = function(
  identifier: string | symbol | interfaces.Newable<any> | interfaces.Abstract<any>,
  name: string
) {
    return fluentProvider(identifier)
      .whenTargetNamed(name)
      .done();
};

let provideSingleton = function(
  identifier: string | symbol | interfaces.Newable<any> | interfaces.Abstract<any>
) {
    return fluentProvider(identifier)
      .inSingletonScope()
      .done();
};

export { iocContainer, autoProvide, provide, provideSingleton, provideNamed, inject };
```

`./contollers/fooController.ts`
```ts
import { Route } from 'tsoa';
import { provideSingleton, inject } from '../inversify/ioc';

@Route('foo')
@provideSingleton(FooController)
export class FooController {

  constructor(
    @inject(FooService) private fooService: FooService
  ) { }
  ...
}

@provideSingleton(FooService)
export class FooService {
    constructor(
        // maybe even more dependencies to be injected...
    )
}
```

### Specify error response types for Swagger

```
@Response('400', 'Bad request')
@DefaultResponse<ErrorResponse>('Unexpected error')
@Get('Response')
public async getResponse(): Promise<TestModel> {
    return new ModelService().getModel();
}
```

### Authentication 

```json
{
  "swagger": {
    "securityDefinitions": {
        "api_key": {
            "type": "apiKey",
            "name": "access_token",
            "in": "query"
        },
        "tsoa_auth": {
            "type": "oauth2",
            "authorizationUrl": "http://swagger.io/api/oauth/dialog",
            "flow": "implicit",
            "scopes": {
                "write:pets": "modify things",
                "read:pets": "read things"
            }
        }
    },
    ...
  },
  "routes": {
    "authenticationModule": "./authentication",
    ...
  }
}
```

`./authentication.ts`
```ts
import * as express from 'express';
export function expressAuthentication(request: express.Request, securityName: string, scopes?: string[]): Promise<any> {
    let token;
    if (request.query && request.query.access_token) {
        token = request.query.access_token;
    }

    if (token === 'abc123456') {
        return Promise.resolve({
            id: 1,
            name: 'Ironman'
        });
    } else {
        return Promise.reject({});
    }
};

import * as hapi from 'hapi';
export function hapiAuthentication(request: hapi.Request, securityName: string, scopes?: string[]): Promise<any> {
    ...
}

import { Request } from 'koa';
export function koaAuthentication(request: Request, securityName: string, scopes?: string[]): Promise<any> {
    ...
}
```
`./contollers/securityController.ts`
```ts
import { Get, Route, Security, DefaultResponse } from 'tsoa';

@Route('secure')
export class SecureController {
    @DefaultResponse<ErrorResponseModel>('Unexpected error')
    @Security('api_key')
    @Get("UserInfo")
    public async userInfo(@Request() request: any): Promise<UserResponseModel> {
        return Promise.resolve(request.user);
    }
}
```


### Use awesome Swagger tools

Now that you have a swagger spec (swagger.json), you can use all kinds of amazing tools that [generate documentation, client SDKs, and more](http://swagger.io/).

## Installation

```
npm install tsoa --save
```

## Command Line Interface

For information on the configuration object (tsoa.json), check out the following:

[Configuration definition](./src/config.ts)

[Configuration sample](./tsoa.json)

### Swagger.json generation

```
Usage: tsoa swagger [options]

Options:
   --configuration, -c  tsoa configuration file; default is tsoa.json in the working directory [string]
```

### Route generation

```
Usage: tsoa routes [options]

Options:
  --configuration, -c  tsoa configuration file; default is tsoa.json in the working directory [string]
```

## Examples

[An example project is available here](https://github.com/lukeautry/tsoa-example)

Also see example controllers in [the tests](tests/fixtures/controllers)
